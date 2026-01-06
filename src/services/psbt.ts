import * as ecc from '@bitcoinerlab/secp256k1';
import * as bitcoin from 'bitcoinjs-lib';

import { resolveFeeRate } from '@/lib/fee-rate';
import { logger } from '@/lib/logger';
import { RunePSBT, type RunePSBTInput as PSBTInput } from '@/lib/psbt';
import { selectRuneUtxos, type UTXO } from '@/lib/utxo-selection';
import { redis } from '@/providers/redis';
import { runeProvider } from '@/providers/rune-provider';

bitcoin.initEccLib(ecc);

interface Party {
  address: string;
  public?: string;
  retention?: string;
  rune_id: string;
  amount: bigint;
  desiredUtxos?: number;
  allowedUtxos?: string[];
}

export class PSBTService {
  static NotEnoughLiquidityError = class NotEnoughLiquidityError extends Error {
    constructor(message = 'No valid utxo found') {
      super(message);
    }
  };

  static NotEnoughBalanceError = class NotEnoughBalanceError extends Error {
    constructor(message = 'Not enough balance to pay fees') {
      super(message);
    }
  };

  constructor(
    private readonly source: Party,
    private readonly target: Party,
    private readonly payer: Omit<Party, 'amount' | 'rune_id'> = source,
    private readonly network = bitcoin.networks.bitcoin,
    private readonly feeRate?: number,
  ) {}

  private static sortingCriteria(score: (e: PSBTInput) => bigint, a: PSBTInput, b: PSBTInput) {
    if (!a.block_height && b.block_height) return -1;
    if (a.block_height && !b.block_height) return 1;
    return Number(score(a) - score(b));
  }

  private convertToUtxo(input: PSBTInput): UTXO {
    return {
      hash: input.hash,
      index: input.index,
      value: input.value,
      address: input.address,
      publicKey: input.publicKey,
      block_height: input.block_height,
      runes: input.runes,
    };
  }

  private async prepareAvailableUtxos() {
    const [{ data: targetUTXOs }, { data: sourceUTXOs }, { data: payerUTXOs }] = await Promise.all([
      runeProvider.mempool.runicUTXOs({ wallet_addr: this.target.address }),
      runeProvider.mempool.runicUTXOs({ wallet_addr: this.source.address }),
      runeProvider.mempool.cardinalUTXOs({ wallet_addr: this.payer.address }),
    ]);

    type UTXO = (typeof targetUTXOs | typeof sourceUTXOs | typeof payerUTXOs)[number];
    const mapToPsbtInput = (utxo: UTXO): PSBTInput => ({
      hash: utxo.txid,
      index: utxo.vout,
      value: BigInt(utxo.value),
      address: utxo.address,
      publicKey: '',
      block_height: utxo.block_height,
      runes:
        'rune_ids' in utxo &&
        Array.isArray(utxo.rune_ids) &&
        Array.isArray(utxo.amounts) &&
        utxo.rune_ids.length === utxo.amounts.length
          ? utxo.rune_ids.reduce((acc, id, i) => {
              try {
                return { ...acc, [id]: BigInt((utxo.amounts as string[])[i]) };
              } catch (error) {
                logger.warn('Invalid amount format for rune in UTXO:', {
                  rune_id: id,
                  amount: (utxo.amounts as string[])[i],
                  error: error instanceof Error ? error.message : String(error),
                });
                return acc;
              }
            }, {})
          : {},
    });

    const targetOutpoints = targetUTXOs
      .map((x) => mapToPsbtInput(x))
      .filter(
        (x) =>
          !this.target.allowedUtxos || this.target.allowedUtxos?.includes(`${x.hash}:${x.index}`),
      )
      .filter((x) => x.runes[this.target.rune_id])
      .sort(PSBTService.sortingCriteria.bind(null, (e) => e.runes[this.target.rune_id]));

    const sourceOutpoints = sourceUTXOs
      .filter((x) => x.rune_ids + '' === this.source.rune_id)
      .map((x) => ({ ...mapToPsbtInput(x), publicKey: this.source.public || '' }))
      .sort(PSBTService.sortingCriteria.bind(null, (e) => e.runes[this.source.rune_id]));

    const payerOutpoints = payerUTXOs
      .map((x) => ({ ...mapToPsbtInput(x), publicKey: this.payer.public || '' }))
      .sort(PSBTService.sortingCriteria.bind(null, (e) => e.value));

    return { target: targetOutpoints, source: sourceOutpoints, payer: payerOutpoints };
  }

  private async addInputs(
    target: bigint,
    outpoints: PSBTInput[],
    rune: string,
    feeRate: number,
    shouldAdd: (e: PSBTInput) => Promise<boolean> | boolean = () => true,
  ) {
    // Convert PSBTInputs to UTXOs for the selection algorithm
    const utxos = outpoints.map((input) => this.convertToUtxo(input));

    // Filter out frozen/locked UTXOs before selection
    const availableUtxos: UTXO[] = [];
    const utxoKeys = utxos.map((utxo) => `${utxo.hash}:${utxo.index}`);

    let lockedSet = new Set<string>();
    if (redis.client && utxoKeys.length > 0) {
      const pipeline = redis.client.pipeline();
      utxoKeys.forEach((utxoKey) => pipeline.exists(`utxo:${utxoKey}`));
      const results = await pipeline.exec();
      if (!results) {
        throw new Error('Failed to check UTXO locks');
      }

      lockedSet = new Set(
        results
          ?.map((result, index) => {
            if (!result) return null;
            const [error, value] = result;
            if (error) {
              logger.error('Failed to check UTXO lock status', {
                utxo: utxoKeys[index],
                error: error instanceof Error ? error.message : String(error),
              });
              throw error;
            }
            return value ? utxoKeys[index] : null;
          })
          .filter((utxoKey): utxoKey is string => Boolean(utxoKey)) ?? [],
      );
    }

    for (const utxo of utxos) {
      const utxoKey = `${utxo.hash}:${utxo.index}`;
      if (lockedSet.has(utxoKey)) {
        logger.debug('Skipping locked UTXO during selection', { utxo: utxoKey });
        continue;
      }
      availableUtxos.push(utxo);
    }
    // Use efficient UTXO selection on available (unlocked) UTXOs
    const selectionResult = selectRuneUtxos(availableUtxos, rune, target, feeRate, 'target_aware');

    if (!selectionResult) {
      logger.debug('UTXO selection failed', {
        target: target.toString(),
        runeId: rune,
        totalUtxos: utxos.length,
        availableUtxos: availableUtxos.length,
        lockedUtxos: utxos.length - availableUtxos.length,
        totalAvailable: availableUtxos
          .reduce((sum, u) => sum + (u.runes[rune] || BigInt(0)), BigInt(0))
          .toString(),
      });
      return undefined;
    }

    logger.debug('UTXO selection result', {
      totalUtxos: utxos.length,
      availableUtxos: availableUtxos.length,
      lockedUtxos: utxos.length - availableUtxos.length,
      selectedCount: selectionResult.selectedUtxos.length,
      totalValue: selectionResult.totalValue.toString(),
      efficiency: selectionResult.efficiency,
      changeValue: selectionResult.changeValue.toString(),
    });

    // Filter selected UTXOs through shouldAdd check
    const selectedInputs: PSBTInput[] = [];
    for (const utxo of selectionResult.selectedUtxos) {
      const originalInput = outpoints.find(
        (input) => input.hash === utxo.hash && input.index === utxo.index,
      );

      if (originalInput && (await shouldAdd(originalInput))) {
        selectedInputs.push(originalInput);
      }
    }

    // Verify we still have enough after filtering
    const totalSelected = selectedInputs.reduce(
      (sum, input) => sum + (input.runes[rune] || BigInt(0)),
      BigInt(0),
    );
    if (totalSelected < target) {
      logger.debug('Insufficient balance after shouldAdd filtering', {
        totalSelected: totalSelected.toString(),
        target: target.toString(),
      });
      return undefined;
    }

    return selectedInputs;
  }

  private splitRemainder(psbt: RunePSBT, sender: Party, currentUtxos: number, isPointer: boolean) {
    const remainder = psbt.getAmountOf(sender.rune_id) - sender.amount;
    if (currentUtxos >= (sender.desiredUtxos || 0)) {
      const runes = { [sender.rune_id]: remainder };
      return [{ isPointer, address: sender.address, runes }];
    }
    const half = remainder / BigInt(2);
    return [
      { address: sender.address, runes: { [sender.rune_id]: half }, isPointer },
      { address: sender.address, runes: { [sender.rune_id]: remainder - half } },
    ];
  }

  async build() {
    const { source, payer, target, network } = this;
    const feeRate = await resolveFeeRate(this.feeRate);

    const utxos = await this.prepareAvailableUtxos();
    logger.debug('Unstake build UTXO summary', {
      sourceUtxos: utxos.source.length,
      sourceConfirmed: utxos.source.filter((u) => !!u.block_height).length,
      payerUtxos: utxos.payer.length,
      payerConfirmed: utxos.payer.filter((u) => !!u.block_height).length,
      requestedSource: source.amount.toString(),
      requestedTarget: target.amount.toString(),
      sourceRuneId: source.rune_id,
      targetRuneId: target.rune_id,
    });
    const runePsbt = new RunePSBT(network).setPayer(...utxos.payer);

    const lock = (e: PSBTInput) => redis.utxo.lock(`${e.hash}:${e.index}`, source.address, 180);
    const targetInputs = await this.addInputs(
      target.amount,
      utxos.target,
      target.rune_id,
      feeRate,
      lock,
    );
    if (!targetInputs) throw new PSBTService.NotEnoughLiquidityError();
    runePsbt.addInput(...targetInputs);

    const sourceInputs = await this.addInputs(source.amount, utxos.source, source.rune_id, feeRate);
    if (!sourceInputs) {
      logger.debug('Insufficient staked balance to cover requested amount', {
        available: utxos.source
          .reduce((a, b) => a + (b.runes[source.rune_id] || BigInt(0)), BigInt(0))
          .toString(),
        requested: source.amount.toString(),
      });
      throw new PSBTService.NotEnoughBalanceError(
        'Not enough staked balance to unstake the requested amount',
      );
    }
    runePsbt.addInput(...sourceInputs);

    runePsbt.addOutput(
      ...this.splitRemainder(runePsbt, target, utxos.target.length, true),
      { address: target.retention || target.address, runes: { [source.rune_id]: source.amount } },
      ...this.splitRemainder(runePsbt, source, utxos.source.length, false),
      { address: source.retention || source.address, runes: { [target.rune_id]: target.amount } },
    );

    let psbt;
    try {
      psbt = await runePsbt.build(feeRate);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Insufficient balance')) {
        logger.debug('Insufficient BTC balance to pay network fees', {
          payerConfirmed: utxos.payer.filter((u) => !!u.block_height).length,
          payerTotal: utxos.payer.length,
        });
        throw new PSBTService.NotEnoughBalanceError('Insufficient BTC to pay network fees');
      }
      throw error;
    }

    const toSign = runePsbt.inputs
      .map((x, i) => ({ index: i, address: x.address }))
      .filter((x) => [source.address, payer.address].includes(x.address));

    logger.debug('Prepared PSBT inputs for signing', {
      inputs: toSign.map(
        (x) => `${runePsbt.inputs[x.index].hash}:${runePsbt.inputs[x.index].index}`,
      ),
      inputsToSign: toSign.length,
      payerInputs: toSign.filter((x) => x.address === payer.address).length,
      sourceInputs: toSign.filter((x) => x.address === source.address).length,
    });

    return {
      feeRate,
      psbt: psbt.toBase64(),
      toSign,
    };
  }
}
