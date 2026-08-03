import { argv } from 'node:process';

import { tryDecodeRunestone } from '@magiceden-oss/runestone-lib';
import * as bitcoin from 'bitcoinjs-lib';
import dotenv from 'dotenv';

dotenv.config();

const network =
  process.env.NEXT_PUBLIC_NETWORK === 'mainnet'
    ? bitcoin.networks.mainnet
    : bitcoin.networks.testnet;

async function main() {
  const psbt = bitcoin.Psbt.fromBase64(argv[2], { network });

  console.log(psbt.txOutputs);

  const decoded = tryDecodeRunestone({
    vout: psbt.txOutputs.map((e) => ({
      scriptPubKey: { hex: Buffer.from(e.script).toString('hex') },
    })),
  });

  decoded.edicts = decoded.edicts.map((e) => ({
    id: `${e.id.block}:${e.id.tx}`,
    amount: e.amount.toString(),
    output: e.output,
    address: psbt.txOutputs[e.output].address,
  }));

  //decoded.vout = tx.vout;

  console.log(decoded);
}

main();
