import { sql } from 'drizzle-orm';
import {
  pgTable,
  serial,
  timestamp,
  varchar,
  numeric,
  integer,
  text,
  uuid,
} from 'drizzle-orm/pg-core';

export const tokenBalances = pgTable('token_balances', {
  id: serial('id').primaryKey(),
  address: varchar({ length: 255 }).notNull(),
  tokenSymbol: varchar({ length: 50 }).notNull(),
  balance: numeric().notNull(),
  block: integer().notNull(),
  timestamp: timestamp()
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export const poolBalances = pgTable('pool_balances', {
  id: serial().primaryKey(),
  staked: numeric().notNull(),
  balance: numeric().notNull(),
  //circulating: numeric().notNull(),
  block: integer().notNull().unique(),
  timestamp: timestamp()
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export const stakes = pgTable('stakes', {
  id: serial().primaryKey(),
  uuid: uuid('uuid').defaultRandom().notNull().unique(),
  address: varchar({ length: 255 }).notNull(),
  amount: numeric().notNull(),
  sAmount: numeric().notNull(),
  block: integer(),
  txid: varchar({ length: 255 }).notNull(),
  timestamp: timestamp()
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  psbt: text(),
  //canisterOutpoints: text().array(),
});

export const unstakes = pgTable('unstakes', {
  id: serial().primaryKey(),
  uuid: uuid('uuid').defaultRandom().notNull().unique(),
  address: varchar({ length: 255 }).notNull(),
  amount: numeric().notNull(),
  sAmount: numeric().notNull(),
  block: integer(),
  txid: varchar({ length: 255 }).notNull(),
  timestamp: timestamp()
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  claimTx: varchar({ length: 255 }),
  claimTxBlock: integer(),
  psbt: text(),
});
