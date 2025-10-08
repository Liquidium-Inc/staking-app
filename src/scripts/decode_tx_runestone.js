const { tryDecodeRunestone } = require('@magiceden-oss/runestone-lib');
const { argv } = require('process');
const mempool = require('@mempool/mempool.js');

const client = new mempool({
  hostname: 'mempool.space/testnet4',
});

async function main() {
  const tx = await client.bitcoin.transactions.getTx({ txid: argv[2] });

  const decoded = tryDecodeRunestone({
    vout: tx.vout.map((e) => ({ scriptPubKey: { hex: e.scriptpubkey } })),
  });

  decoded.edicts = decoded.edicts.map((e) => ({
    id: `${e.id.block}:${e.id.tx}`,
    amount: e.amount.toString(),
    output: e.output,
    address: tx.vout[e.output].scriptpubkey_address,
  }));

  //decoded.vout = tx.vout;

  console.log(decoded);
}

main();
