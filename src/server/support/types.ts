import type { BitcoinAddressType } from '@/lib/address';

export enum TxChainState {
  Confirmed = 'confirmed',
  Unconfirmed = 'unconfirmed',
  // Never broadcast (abandoned PSBT) or dropped from the mempool.
  NotFound = 'not_found',
  // The chain lookup failed; nothing can be concluded.
  Unknown = 'unknown',
}

export type TxChainStatus =
  | { state: TxChainState.Confirmed; blockTimeMs: number; blockHeight: number }
  | { state: TxChainState.Unconfirmed }
  | { state: TxChainState.NotFound }
  | { state: TxChainState.Unknown };

export enum ClaimStatus {
  None = 'none',
  Pending = 'pending',
  Confirmed = 'confirmed',
  NotFound = 'not_found',
  Unknown = 'unknown',
}

// List states, derived from our records plus a chain lookup for unsettled rows.
export enum StakeState {
  Pending = 'pending',
  Confirmed = 'confirmed',
  // Prepared but never seen on chain (abandoned PSBT or dropped from the mempool).
  NotBroadcast = 'not_broadcast',
}

export enum UnstakeState {
  Pending = 'pending',
  // Unstake confirmed, not claimed yet (cooldown or withdrawable).
  Confirmed = 'confirmed',
  // A claim tx was sent. The item's claimStatus has its chain status: the withdraw
  // monitor rarely records claimTxBlock, so our records can't tell pending from done.
  ClaimSubmitted = 'claim_submitted',
  NotBroadcast = 'not_broadcast',
}

export type StakeFact = {
  id: number;
  state: StakeState;
  txid: string;
  amount: string;
  sAmount: string;
  createdAtMs: number;
  recordedConfirmed: boolean;
  chain: TxChainStatus;
  feeRate: number | null;
};

export type UnstakeFact = {
  id: number;
  state: UnstakeState;
  txid: string;
  amount: string;
  sAmount: string;
  createdAtMs: number;
  recordedConfirmed: boolean;
  chain: TxChainStatus;
  claimTx: string | null;
  claimChain: TxChainStatus | null;
};

export type ActivityFact = {
  direction: 'in' | 'out';
  token: 'LIQ' | 'sLIQ';
  amount: string;
  outpoint: string;
  ts: string;
};

/** Totals over one list kind's full history for the address. */
export type KindTotals = {
  total: number | null;
  byState?: Record<string, number>;
  totalExact: boolean;
  byStateExact?: boolean;
};

/** Everything the support context is computed from. Internal; never serialized directly. */
export type StakingFacts = {
  address: string;
  addressType: BitcoinAddressType;
  addressTypeSupported: boolean;
  liqBalance: string | null;
  sliqBalance: string | null;
  btcSats: bigint | null;
  mixedRuneUtxoCount: number | null;
  exchangeRate: number | null;
  hourFeeRate: number | null;
  withdrawTimeMs: number;
  // Summary selections: open items first, then the most recent, at most SUPPORT_SUMMARY_ITEM_LIMIT.
  stakes: StakeFact[];
  unstakes: UnstakeFact[];
  recentActivity: ActivityFact[] | null;
  totals: { stakes: KindTotals; unstakes: KindTotals; activity: KindTotals };
  unavailable: string[];
};

export type HintSeverity = 'info' | 'warn' | 'critical';

export type SupportHint = {
  code: string;
  severity: HintSeverity;
  message: string;
  escalate?: boolean;
  data?: Record<string, string | number | boolean | null>;
};

export type LabelledValue = {
  ref: string;
  label: string;
  value: string;
  destination?: boolean;
};
