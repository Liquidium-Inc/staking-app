const dotenv = require('dotenv');

dotenv.config({ path: '.env' });

const { Secp256k1KeyIdentity } = require('@dfinity/identity-secp256k1');

const identity = Secp256k1KeyIdentity.generate();

// Get the principal ID from the identity
const principal = identity.getPrincipal();
console.log('ORACLE_PRINCIPAL =', principal.toString());
console.log('ORACLE_PRIVATE_KEY =', Buffer.from(identity.getKeyPair().secretKey).toString('hex'));
