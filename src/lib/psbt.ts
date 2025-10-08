import * as ecc from '@bitcoinerlab/secp256k1';
import { encodeRunestone, RunestoneSpec } from '@magiceden-oss/runestone-lib';
import * as bitcoin from 'bitcoinjs-lib';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';

import { config } from '@/config/config';

bitcoin.initEccLib(ecc);

export interface RunePSBTInput {
  hash: string;
  index: number;
  address: string;
  publicKey: string;
  value: bigint;
  block_height?: number;
  runes: Record<string, bigint>;
}

interface RunePSBTOutput {
  address: string;
  value?: bigint;
  isPointer?: boolean;
  runes: Record<string, bigint>;
}

export class RunePSBT {
  inputs = [] as RunePSBTInput[];
  outputs = [] as Required<RunePSBTOutput>[];
  payer = [] as RunePSBTInput[];

  constructor(public network = bitcoin.networks.bitcoin) {}

  static dustAmount = BigInt(config.protocol.dustAmount);

  getAmountOf(rune: string) {
    return this.inputs.filter((x) => x.runes[rune]).reduce((a, b) => a + b.runes[rune], BigInt(0));
  }

  addInput(...input: RunePSBTInput[]) {
    this.inputs.push(...input);
    return this;
  }

  setPayer(...utxos: RunePSBTInput[]) {
    this.payer.push(...utxos);
    return this;
  }

  addOutput(...output: RunePSBTOutput[]) {
    if (this.outputs.some((o) => o.isPointer) && output.some((o) => o.isPointer))
      throw new Error('Pointer output already exists');
    this.outputs.push(
      ...output.map((o) => ({ value: RunePSBT.dustAmount, isPointer: false, ...o })),
    );
    return this;
  }

  get totalSat() {
    return this.inputs.reduce((acc, input) => acc + input.value, BigInt(0));
  }

  get inputRunes() {
    return this.inputs.reduce(
      (acc, cur) => {
        acc[cur.address] ??= {};
        for (const [runeId, amount] of Object.entries(cur.runes)) {
          acc[cur.address][runeId] ??= BigInt(0);
          acc[cur.address][runeId] += amount;
        }
        return acc;
      },
      {} as Record<string, Record<string, bigint>>,
    );
  }

  get outputRunes() {
    return this.outputs.reduce(
      (acc, cur) => {
        acc[cur.address] ??= {};
        for (const [runeId, amount] of Object.entries(cur.runes)) {
          acc[cur.address][runeId] ??= BigInt(0);
          acc[cur.address][runeId] += amount;
        }
        return acc;
      },
      {} as Record<string, Record<string, bigint>>,
    );
  }

  get runestone(): RunestoneSpec {
    const pointer = this.outputs.findIndex((o) => o.isPointer) + 1 || undefined;
    const edicts = this.outputs
      .flatMap(({ runes }, i) =>
        Object.entries(runes).map(([runeId, amount]) => ({
          id: { block: BigInt(runeId.split(':')[0]), tx: +runeId.split(':')[1] },
          amount: amount,
          output: i + 1, // the first output is the runestone
        })),
      )
      .sort((a, b) => Number(a.id.block - b.id.block) || a.id.tx - b.id.tx || a.output - b.output)
      .filter((e) => e.amount !== BigInt(0));

    const negativeEdicts = edicts.filter((e) => e.amount < 0);
    if (negativeEdicts.length > 0) {
      throw new Error(
        `Negative amount for ${negativeEdicts.map((e) => `${e.id.block}:${e.id.tx}`).join(', ')}`,
      );
    }

    return { pointer, edicts };
  }

  private vSize(psbt: bitcoin.Psbt) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let estimate = BigInt((psbt as any).__CACHE.__TX.virtualSize());
    // Add 65 vbytes per P2RP (Taproot) input and 73 vbytes per P2WPKH input for fee estimation
    for (const input of this.inputs) {
      estimate += this.isTaproot(input.address) ? BigInt(17) : BigInt(73);
    }
    // Add an extra 43 bytes for the change output
    estimate += 43n;
    return estimate;
  }

  private isTaproot(address: string) {
    try {
      const decoded = bitcoin.address.fromBech32(address);
      return decoded.version === 1 && decoded.data.length === 32;
    } catch {
      return false;
    }
  }

  private mapInput({ hash, index, address, publicKey, value }: RunePSBTInput) {
    const script = bitcoin.address.toOutputScript(address, this.network);

    const key = this.isTaproot(address)
      ? toXOnly(Uint8Array.from(Buffer.from(publicKey, 'hex')))
      : undefined;

    let redeemScript;
    if (address.startsWith('3')) {
      const payment = bitcoin.payments.p2sh({
        redeem: bitcoin.payments.p2wpkh({ pubkey: Buffer.from(publicKey, 'hex') }),
      });
      redeemScript = payment!.redeem!.output;
    }

    return {
      hash,
      index,
      witnessUtxo: { value, script },
      ...(key ? { tapInternalKey: key } : {}),
      ...(redeemScript ? { redeemScript } : {}),
    };
  }

  async build(feeRate: number) {
    const psbt = new bitcoin.Psbt({ network: this.network });

    psbt.addInputs(this.inputs.map(this.mapInput.bind(this)));

    const { encodedRunestone } = encodeRunestone(this.runestone);

    psbt.addOutput({ script: encodedRunestone, value: BigInt(0) });
    psbt.addOutputs(this.outputs.map(({ address, value }) => ({ address, value })));

    const firstPayer = this.payer[0];

    let amount =
      this.inputs.reduce((acc, input) => acc + input.value, BigInt(0)) -
      this.outputs.reduce((acc, input) => acc + input.value, BigInt(0));

    const minimumFee = BigInt(1000);
    let actualFee: bigint;

    // Calculate fee dynamically as inputs are added
    do {
      const calculatedFee = this.vSize(psbt) * BigInt(feeRate);
      actualFee = calculatedFee > minimumFee ? calculatedFee : minimumFee;

      if (amount < actualFee) {
        const utxo = this.payer.pop();
        if (!utxo) throw new Error('Insufficient balance');
        this.addInput(utxo);
        psbt.addInput(this.mapInput(utxo));
        amount += utxo.value;
      }
    } while (amount < actualFee);

    if (amount - actualFee > RunePSBT.dustAmount) {
      psbt.addOutput({
        address: firstPayer.address,
        value: amount - actualFee,
      });
    }

    return psbt;
  }
}
