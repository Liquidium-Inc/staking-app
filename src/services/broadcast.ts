import * as ecc from '@bitcoinerlab/secp256k1';
import { tryDecodeRunestone, RunestoneSpec, Cenotaph } from '@magiceden-oss/runestone-lib';
import * as bitcoin from 'bitcoinjs-lib';

import { config as publicConfig } from '@/config/public';
import { db } from '@/db';
import {
  BROADCAST_ERROR_CODES,
  MEMPOOL_ERROR_PATTERNS,
  formatBroadcastErrorMessage,
  type BroadcastErrorCode,
} from '@/lib/error-codes';
import { logger } from '@/lib/logger';
import { canister } from '@/providers/canister';
import { mempool } from '@/providers/mempool';
import { redis } from '@/providers/redis';

export const maxDuration = 120;

const runeId = publicConfig.rune.id;
const stakedId = publicConfig.sRune.id;

bitcoin.initEccLib(ecc);

type Edict = NonNullable<RunestoneSpec['edicts']>[number];

export class BroadcastService {
  static Error = class BaseError extends Error {};

  static InvalidRunestone = class InvalidRunestone extends BroadcastService.Error {
    constructor(message = 'Invalid runestone') {
      super(message);
    }
  };

  static InvalidExchangeRate = class InvalidExchangeRate extends BroadcastService.Error {
    constructor(message = 'Exchange rate has changed') {
      super(message);
    }
  };

  static CanisterIsNotPointer = class CanisterIsNotPointer extends BroadcastService.Error {
    constructor(message = 'Canister is not the pointer') {
      super(message);
    }
  };

  static TransactionExpired = class TransactionExpired extends BroadcastService.Error {
    constructor(message = 'Transaction expired. Try again') {
      super(message);
    }
  };

  static NegativeAmountError = class NegativeAmount extends BroadcastService.Error {
    constructor(message = 'Amount is negative') {
      super(message);
    }
  };

  static NoSenderFound = class NoSenderFound extends BroadcastService.Error {
    constructor(message = 'No sender found') {
      super(message);
    }
  };

  static OnlyOneSenderAllowed = class OnlyOneSenderAllowed extends BroadcastService.Error {
    constructor(message = 'Only one sender allowed') {
      super(message);
    }
  };

  static BroadcastError = class BroadcastError extends BroadcastService.Error {
    public readonly code?: BroadcastErrorCode;
    public readonly txid?: string;

    constructor(
      message = 'Transaction broadcast failed',
      code?: BroadcastErrorCode,
      txid?: string,
    ) {
      super(message);
      this.code = code;
      this.txid = txid;
    }
  };

  constructor(
    public readonly psbt: bitcoin.Psbt,
    public readonly operation: 'stake' | 'unstake',
    private readonly skipDatabaseInsert: boolean = false,
  ) {}

  get runestone() {
    const runestone = tryDecodeRunestone({
      vout: this.psbt.txOutputs.map((e) => ({
        scriptPubKey: { hex: Buffer.from(e.script).toString('hex') },
      })),
    });
    return runestone;
  }

  private assertRunestone(
    runestone: RunestoneSpec | Cenotaph | null,
  ): asserts runestone is { edicts: NonNullable<RunestoneSpec['edicts']>; pointer: number } {
    if (!runestone || !('edicts' in runestone) || !('pointer' in runestone)) {
      throw new BroadcastService.InvalidRunestone();
    }
    if (runestone.pointer === undefined || runestone.edicts === undefined) {
      throw new BroadcastService.InvalidRunestone();
    }
  }

  private assertPointerIsCanister(pointer: number, canisterAddress: string) {
    if (this.psbt.txOutputs[pointer].address !== canisterAddress) {
      throw new BroadcastService.CanisterIsNotPointer();
    }
  }

  private getSender() {
    const sender = this.psbt.txOutputs.find(
      (item, index) =>
        index > 0 &&
        (item.address?.slice(2).startsWith('1p') || item.address?.slice(2).startsWith('1q')) &&
        item.address !== canister.address &&
        item.address !== canister.retention,
    );
    if (!sender || !sender.address) {
      throw new BroadcastService.NoSenderFound();
    }
    return sender.address;
  }

  private async assertIsLocked(sender: string) {
    const locked = this.psbt.txInputs.filter(
      (_, i) =>
        bitcoin.address.fromOutputScript(
          this.psbt.data.inputs[i].witnessUtxo!.script,
          canister.network,
        ) === canister.address,
    );
    const utxos = locked.map(
      (input) => `${Buffer.from(input.hash.toReversed()).toString('hex')}:${input.index}`,
    );

    if (!(await redis.utxo.extend(utxos, sender, 180)))
      throw new BroadcastService.TransactionExpired();

    return utxos;
  }

  private getOutputAmount(edicts: Edict[], address: string, token: string) {
    const [block, tx] = token.split(':');
    return edicts
      .filter((e) => this.psbt.txOutputs[e.output].address === address)
      .filter((e) => e.id.block === BigInt(block) && e.id.tx === +tx)
      .reduce((acc, e) => acc + e.amount, BigInt(0));
  }

  private async assertExchangeRate(amount: bigint, sAmount: bigint) {
    if (amount < 0) throw new BroadcastService.NegativeAmountError();
    if (sAmount < 0) throw new BroadcastService.NegativeAmountError();
    const { circulating, balance } = await canister.getExchangeRate();
    const isInvalid =
      this.operation === 'stake'
        ? amount * circulating < sAmount * balance
        : amount * circulating > sAmount * balance;
    if (isInvalid) throw new BroadcastService.InvalidExchangeRate();
  }

  private async insertTransaction(sender: string, amount: bigint, sAmount: bigint, txid: string) {
    await db[this.operation].insert({
      address: sender,
      amount: amount.toString(),
      block: null,
      txid,
      sAmount: sAmount.toString(),
    });
  }

  async broadcast() {
    let [sender, utxos] = ['' as string, [] as string[]] as const;
    try {
      const { psbt, runestone } = this;
      this.assertRunestone(runestone);
      const { edicts, pointer } = runestone;
      this.assertPointerIsCanister(pointer, canister.address);
      sender = this.getSender();
      utxos = await this.assertIsLocked(sender);

      const runeAddress = this.operation === 'stake' ? canister.address : canister.retention;
      const amount = this.getOutputAmount(edicts, runeAddress, runeId);
      const stakedAddress = this.operation === 'stake' ? sender : canister.address;
      const sAmount = this.getOutputAmount(edicts, stakedAddress, stakedId);

      await this.assertExchangeRate(amount, sAmount);

      logger.info(`${sender} is trying to ${this.operation} ${amount} runes for ${sAmount}`);

      psbt.txInputs.forEach((_, index) => {
        try {
          psbt.finalizeInput(index);
        } catch (error) {
          logger.warn('Could not finalize input before co-signing', { index, error });
        }
      });

      const response = await canister[this.operation](psbt.toBase64());
      if (response.error)
        throw new BroadcastService.BroadcastError(
          response.error === 'Validation failed'
            ? 'Transaction failed. Please wait for any pending transactions to confirm, then try again.'
            : response.error,
          BROADCAST_ERROR_CODES.BROADCAST_FAILED,
        );

      const signedPsbt = bitcoin.Psbt.fromBase64(response.signed_psbt);

      const tx = signedPsbt.extractTransaction();
      const feeRate = signedPsbt.getFeeRate();

      logger.info(`broadcasting tx with fee ${feeRate} sat/vbyte`);
      try {
        await mempool.transactions.postTx({ txhex: tx.toHex() });

        // Lock UTXOs for 5 minutes after successful broadcast to prevent double-spending
        logger.debug(`locking ${utxos.length} UTXOs for 5 minutes after broadcast`);
        for (const utxo of utxos) {
          await redis.utxo.lock(utxo, sender, 300); // 300 seconds = 5 minutes
        }
      } catch (error) {
        // Check for known mempool error patterns and map to error codes
        const errorData = (error as { response?: { data?: string } })?.response?.data;
        if (errorData && typeof errorData === 'string') {
          // Find matching error pattern
          const matchedPattern = Object.keys(MEMPOOL_ERROR_PATTERNS).find((pattern) =>
            errorData.includes(pattern),
          );

          if (matchedPattern) {
            const errorCode =
              MEMPOOL_ERROR_PATTERNS[matchedPattern as keyof typeof MEMPOOL_ERROR_PATTERNS];
            const message = formatBroadcastErrorMessage(errorCode, errorData);
            throw new BroadcastService.BroadcastError(message, errorCode, tx.getId());
          }

          // Generic mempool error with data
          throw new BroadcastService.BroadcastError(
            `Transaction broadcast failed: ${errorData}`,
            BROADCAST_ERROR_CODES.BROADCAST_FAILED,
            tx.getId(),
          );
        }

        // Re-throw unknown errors
        const message = (error as Error)?.message ?? 'Transaction broadcast failed';
        throw new BroadcastService.BroadcastError(
          message,
          BROADCAST_ERROR_CODES.BROADCAST_FAILED,
          tx.getId(),
        );
      }

      if (!this.skipDatabaseInsert) {
        logger.debug(`inserting transaction ${tx.getId()} into db`);
        await this.insertTransaction(sender, amount, sAmount, tx.getId());
      } else {
        logger.debug(`skipping database insertion for transaction ${tx.getId()} (already exists)`);
      }

      return {
        fee: signedPsbt.getFee() + '',
        feeRate,
        psbt: signedPsbt.toBase64(),
        tx: tx.toHex(),
        txid: tx.getId(),
      };
    } catch (error) {
      await redis.utxo.free(utxos, sender);
      throw error;
    }
  }
}
