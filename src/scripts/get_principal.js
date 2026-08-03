import { Secp256k1KeyIdentity } from '@icp-sdk/core/identity/secp256k1';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const secretKey = Buffer.from(process.env.ORACLE_PRIVATE_KEY, 'hex');
const identity = Secp256k1KeyIdentity.fromSecretKey(secretKey);

// Get the principal ID from the identity
const principal = identity.getPrincipal();
console.log('Principal ID:', principal.toString());
