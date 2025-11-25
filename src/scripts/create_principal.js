const dotenv = require('dotenv');

dotenv.config({ path: '.env' });

const { Secp256k1KeyIdentity } = require('@dfinity/identity-secp256k1');

const revealSecret =
  process.argv.includes('--reveal-secret') || process.env.PRINT_SECRET?.toLowerCase() === 'true';

const identity = Secp256k1KeyIdentity.generate();

// Get the principal ID from the identity
const principal = identity.getPrincipal();
console.log('ORACLE_PRINCIPAL =', principal.toString());

if (!revealSecret) {
  console.warn(
    'Secret key hidden. Re-run with --reveal-secret (or PRINT_SECRET=true) to print ORACLE_PRIVATE_KEY.',
  );
  process.exit(0);
}

console.log('ORACLE_PRIVATE_KEY =', Buffer.from(identity.getKeyPair().secretKey).toString('hex'));
