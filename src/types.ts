export type MarketStatus = "open" | "resolved" | "invalid";
export type Outcome = "yes" | "no" | "invalid";
export type Side = "yes" | "no";
export type ClaimKind = "payout" | "refund";

export type ActivityType =
  | "stake"
  | "claim"
  | "resolve"
  | "invalidate"
  | "create";

export type DecodedEventBase = {
  eventName: string;
  marketId: bigint;
};

export type MarketCreatedEvent = DecodedEventBase & {
  eventName: "market_created";
  creator: string;
  resolver: string;
  token: string;
  closeAt: bigint;
  resolutionTimeout: bigint;
};

export type StakedEvent = DecodedEventBase & {
  eventName: "staked";
  user: string;
  side: Side;
  amount: bigint;
  yesPool: bigint;
  noPool: bigint;
};

export type MarketResolvedEvent = DecodedEventBase & {
  eventName: "market_resolved";
  resolver: string;
  outcome: Outcome;
};

export type MarketInvalidatedEvent = DecodedEventBase & {
  eventName: "market_invalidated";
  caller: string;
};

export type ClaimedEvent = DecodedEventBase & {
  eventName: "claimed";
  user: string;
  amount: bigint;
  kind: ClaimKind;
};

export type DecodedResolveEvent =
  | MarketCreatedEvent
  | StakedEvent
  | MarketResolvedEvent
  | MarketInvalidatedEvent
  | ClaimedEvent;

export type RawIndexerEvent = {
  txHash: string;
  eventIndex: number;
  ledger: number;
  timestamp?: string;
  topics: unknown[];
  value: unknown;
};

export type MarketRow = {
  id: number;
  creator: string;
  resolver: string;
  question: string | null;
  description: string | null;
  token: string;
  created_at: number | null;
  close_at: number;
  resolution_timeout: number;
  yes_pool: string;
  no_pool: string;
  status: MarketStatus;
  outcome: Outcome | null;
  finalized_at: number | null;
  created_tx: string | null;
  updated_at: string;
};

export type PositionRow = {
  market_id: number;
  user_address: string;
  yes_amount: string;
  no_amount: string;
  claimed: number;
  updated_at: string;
};

export type ActivityRow = {
  id: number;
  user_address: string;
  market_id: number;
  type: ActivityType;
  amount: string | null;
  side: Side | null;
  outcome: Outcome | null;
  claim_kind: ClaimKind | null;
  tx_hash: string;
  ledger: number | null;
  ts: string;
};
