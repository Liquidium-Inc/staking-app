import { z } from 'zod';

const initializeConfig = () => {
  const protocol = z.object({
    withdrawTime: z.coerce.number().min(0).default(604800),
    expectedConfirmations: z.coerce.number().int().min(1).default(2),
    overwriteTokenConfig: z.coerce.boolean().default(true),
  });

  const sRune = z.object({
    id: z.string().min(1, 'Staked token ID is required'),
    symbol: z.string().min(1, 'Staked token symbol is required').default('/staked-liquidium.svg'),
    name: z.string().min(1, 'Staked token name is required').default('sLIQUIDIUM'),
    decimals: z.coerce.number().min(0).default(2),
    supply: z.coerce
      .number()
      .min(1)
      .int()
      .describe('Used for computing the exchange rate, no decimals. E.g: 10000000000'),
    debug: z.object({
      price: z.coerce.number().min(0).default(0),
      btcPrice: z.coerce.number().min(0).default(0),
    }),
  });

  const rune = z.object({
    id: z.string().min(1, 'Rune token ID is required'),
    symbol: z.string().min(1, 'Rune token symbol is required'),
    name: z.string().min(1, 'Rune token name is required'),
    decimals: z.coerce.number().min(0).default(0),
  });

  const mempool = z.object({
    url: z.string().url().default('https://mempool.space'),
  });

  const configSchema = z.object({
    network: z.enum(['mainnet', 'testnet4']).default('mainnet'),
    protocol,
    mempool,
    sRune,
    rune,
  });

  const { success, data, error } = configSchema.safeParse({
    network: process.env.NEXT_PUBLIC_NETWORK,
    protocol: {
      withdrawTime: process.env.NEXT_PUBLIC_WITHDRAW_TIME,
      expectedConfirmations: process.env.NEXT_PUBLIC_EXPECTED_CONFIRMATIONS,
      overwriteTokenConfig: process.env.NEXT_PUBLIC_OVERWRITE_TOKEN_CONFIG + '' === 'true',
    },
    mempool: {
      url: process.env.NEXT_PUBLIC_MEMPOOL_URL,
    },
    sRune: {
      id: process.env.NEXT_PUBLIC_STAKED_ID,
      symbol: process.env.NEXT_PUBLIC_STAKED_SYMBOL,
      name: process.env.NEXT_PUBLIC_STAKED_NAME,
      decimals: process.env.NEXT_PUBLIC_STAKED_DECIMALS,
      supply: process.env.NEXT_PUBLIC_STAKED_SUPPLY,
      debug: {
        price: process.env.NEXT_PUBLIC_DEBUG_TOKEN_PRICE,
        btcPrice: process.env.NEXT_PUBLIC_DEBUG_BTC_PRICE,
      },
    },
    rune: {
      id: process.env.NEXT_PUBLIC_TOKEN_ID,
      symbol: process.env.NEXT_PUBLIC_TOKEN_SYMBOL,
      name: process.env.NEXT_PUBLIC_TOKEN_NAME,
      decimals: process.env.NEXT_PUBLIC_TOKEN_DECIMALS,
    },
  });

  if (!success) {
    console.error('❌ Invalid NEXT_PUBLIC environment variables:', error.flatten());
    process.exit(1);
  }

  return data;
};

export const config = initializeConfig();
