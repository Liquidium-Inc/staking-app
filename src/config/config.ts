import { z } from 'zod';

const initializeConfig = () => {
  const protocol = z.object({
    desiredUtxos: z.coerce.number().min(0).default(0),
    mempoolBalance: z.coerce.boolean().default(false),
    dustAmount: z.coerce.number().min(0).default(546),
  });

  const secrets = z.object({
    cron: z.string().min(1, 'Cron secret is required'),
    oracle: z.string().min(1, 'Oracle private key is required'),
  });

  const db = z.object({
    url: z.string().url().default('postgresql://localhost:5432'),
    redis: z.string().url().default('redis://localhost:6379').optional(),
  });

  const mempool = z.object({
    host: z.string().default('mempool.space'),
  });

  const icp = z.object({ host: z.string().url().default('https://icp-api.io') });

  const bestInSlot = z.object({
    token: z.string().min(1, 'Best in slot token is required'),
    url: z.string().url().default('https://api.bestinslot.xyz/'),
  });

  const ordiscan = z.object({
    token: z.string().min(1, 'Ordiscan API token is required'),
    url: z.string().url().default('https://api.ordiscan.com/v1'),
  });

  const canister = z.discriminatedUnion('isMocked', [
    z.object({
      id: z.string().min(1, 'Canister ID is required'),
      address: z.string().min(1, 'Canister address is required'),
      publicKey: z.string().min(1, 'Canister public key is required'),
      isMocked: z.literal(false),
      retentionAddress: z.string().min(1, 'Retention address is required'),
    }),
    z.object({
      isMocked: z.literal(true),
      secret: z.string().min(1, 'Canister secret is required'),
      retentionSecret: z.string().min(1, 'Retention secret is required'),
    }),
  ]);

  const liquidium = z.object({
    url: z.string().url(),
    token: z.string(),
  });

  const email = z.object({
    mailjetApiKey: z.string().min(1, 'Mailjet API key is required'),
    mailjetApiSecret: z.string().min(1, 'Mailjet API secret is required'),
    fromEmail: z.string().email('Valid from email is required'),
    baseUrl: z.string().url().default('http://localhost:3000'),
  });

  const configSchema = z.object({
    env: z.enum(['development', 'production', 'test']).default('development'),
    network: z.enum(['mainnet', 'testnet4']).default('mainnet'),
    protocol,
    secrets,
    db,
    mempool,
    icp,
    bestInSlot,
    liquidium,
    ordiscan,
    canister,
    email,
  });

  const { success, data, error } = configSchema.safeParse({
    env: process.env.NODE_ENV,
    network: process.env.NEXT_PUBLIC_NETWORK,
    protocol: {
      dustAmount: process.env.DUST_AMOUNT,
      desiredUtxos: process.env.DESIRED_UTXOS,
      overwriteTokenConfig: process.env.OVERWRITE_TOKEN_CONFIG + '' === 'true',
      mempoolBalance: process.env.MEMPOOL_BALANCE + '' === 'true',
    },
    secrets: {
      cron: process.env.CRON_SECRET,
      oracle: process.env.ORACLE_PRIVATE_KEY,
    },
    db: {
      url: process.env.DATABASE_URL,
      redis: process.env.REDIS_URL,
    },
    mempool: {
      host: process.env.MEMPOOL_HOST,
    },
    icp: {
      host: process.env.ICP_HOST,
    },
    bestInSlot: {
      token: process.env.BEST_IN_SLOT_TOKEN,
      url: process.env.BEST_IN_SLOT_URL,
    },
    liquidium: {
      url: process.env.LIQUIDIUM_API_URL,
      token: process.env.LIQUIDIUM_API_TOKEN,
    },
    ordiscan: {
      token: process.env.ORDISCAN_API_TOKEN,
      url: process.env.ORDISCAN_API_URL,
    },
    email: {
      mailjetApiKey: process.env.MAILJET_API_KEY,
      mailjetApiSecret: process.env.MAILJET_API_SECRET,
      fromEmail: process.env.FROM_EMAIL,
      baseUrl: process.env.BASE_URL,
    },
    canister:
      process.env.CANISTER_MOCK + '' === 'true'
        ? {
            isMocked: true,
            secret: process.env.CANISTER_SECRET,
            retentionSecret: process.env.RETENTION_SECRET,
          }
        : {
            isMocked: false,
            id: process.env.CANISTER_ID,
            address: process.env.CANISTER_ADDRESS,
            publicKey: process.env.CANISTER_PUBLIC_KEY,
            retentionAddress: process.env.RETENTION_ADDRESS,
          },
  });

  if (!success) {
    console.error('❌ Invalid environment variables:', error.flatten());
    process.exit(1);
  }

  return data;
};

export const config = initializeConfig();
