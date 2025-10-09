const dotenv = require('dotenv');

dotenv.config({ path: '.env' });

const { Secp256k1KeyIdentity } = require('@dfinity/identity-secp256k1');

const identity = Secp256k1KeyIdentity.generate();

const revealSecret = process.argv.includes('--reveal-secret');

// Get the principal ID from the identity
const principal = identity.getPrincipal();
console.log('ORACLE_PRINCIPAL =', principal.toString());

if (!revealSecret) {
  console.warn(
    'Secret key hidden. Re-run with --reveal-secret to print ORACLE_PRIVATE_KEY (store the output securely).',
  );
  process.exit(0);
}

console.log('ORACLE_PRIVATE_KEY =', Buffer.from(identity.getKeyPair().secretKey).toString('hex'));
