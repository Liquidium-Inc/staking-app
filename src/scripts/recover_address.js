const bitcoin = require('bitcoinjs-lib');

const address = 'tb1qxgmgsyq62pgsz7xclvpnv2lal00l8pz220uw2z';

const network = bitcoin.networks.testnet;

const script = bitcoin.address.toOutputScript(address, network);

console.log(script.toString('hex'));

const recovered = bitcoin.address.fromOutputScript(script, network);

console.log(recovered);
