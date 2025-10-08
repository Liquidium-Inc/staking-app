const dotenv = require('dotenv');

dotenv.config({ path: '.env' });

const { Secp256k1KeyIdentity } = require('@dfinity/identity-secp256k1');
const { Principal } = require('@dfinity/principal');

const secretKey = Buffer.from(process.env.ORACLE_PRIVATE_KEY, 'hex');
const identity = Secp256k1KeyIdentity.fromSecretKey(secretKey);

// Get the principal ID from the identity
const principal = identity.getPrincipal();
console.log('Principal ID:', principal.toString());
