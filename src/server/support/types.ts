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

export type StakeFact = {
  txid: string;
  amount: string;
  sAmount: string;
  createdAtMs: number;
  recordedConfirmed: boolean;
  chain: TxChainStatus;
  feeRate: number | null;
};

export type UnstakeFact = {
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
  stakes: StakeFact[];
  unstakes: UnstakeFact[];
  recentActivity: ActivityFact[] | null;
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
