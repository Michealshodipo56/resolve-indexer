import {
  Account,
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import type { Logger } from "pino";
import type { RawIndexerEvent } from "../types.js";

export type RpcClientOptions = {
  rpcUrl: string;
  networkPassphrase: string;
  contractId: string;
  log?: Logger;
};

export class SorobanEventClient {
  private readonly server: rpc.Server;
  private readonly contractId: string;
  private readonly networkPassphrase: string;
  private readonly log?: Logger;

  constructor(opts: RpcClientOptions) {
    this.server = new rpc.Server(opts.rpcUrl, { allowHttp: true });
    this.contractId = opts.contractId;
    this.networkPassphrase = opts.networkPassphrase;
    if (opts.log) this.log = opts.log;
  }

  async getLatestLedger(): Promise<number> {
    const info = await this.server.getLatestLedger();
    return info.sequence;
  }

  /**
   * Fetch contract events after `cursor` (pagination token) or from `startLedger`.
   */
  async getEvents(params: {
    startLedger?: number;
    cursor?: string;
    limit?: number;
  }): Promise<{
    events: RawIndexerEvent[];
    cursor: string | null;
    latestLedger: number;
  }> {
    const filters = [
      {
        type: "contract" as const,
        contractIds: [this.contractId],
      },
    ];
    const limit = params.limit ?? 100;

    let page: Awaited<ReturnType<rpc.Server["getEvents"]>>;
    if (params.cursor) {
      page = await this.server.getEvents({
        filters,
        cursor: params.cursor,
        limit,
      });
    } else if (params.startLedger !== undefined) {
      page = await this.server.getEvents({
        filters,
        startLedger: params.startLedger,
        limit,
      });
    } else {
      throw new Error("getEvents requires cursor or startLedger");
    }
    const events: RawIndexerEvent[] = [];

    for (const ev of page.events) {
      events.push(normalizeRpcEvent(ev));
    }

    return {
      events,
      cursor: page.cursor ?? null,
      latestLedger: page.latestLedger,
    };
  }

  /**
   * Optional backfill: simulate `get_market(market_id)` on the Resolve contract.
   */
  async getMarketMeta(marketId: bigint): Promise<{
    question: string | null;
    description: string | null;
    createdAt: number | null;
  } | null> {
    try {
      const contract = new Contract(this.contractId);
      const account = await this.server
        .getAccount(this.contractId)
        .catch(() => null);

      const op = contract.call(
        "get_market",
        xdr.ScVal.scvU64(xdr.Uint64.fromString(marketId.toString())),
      );

      const source =
        account ?? new Account(Keypair.random().publicKey(), "0");

      const tx = new TransactionBuilder(source, {
        fee: "100",
        networkPassphrase: this.networkPassphrase || Networks.TESTNET,
      })
        .addOperation(op)
        .setTimeout(30)
        .build();

      const sim = await this.server.simulateTransaction(tx);
      if (!rpc.Api.isSimulationSuccess(sim) || !sim.result?.retval) {
        this.log?.debug(
          { marketId: marketId.toString() },
          "get_market sim failed",
        );
        return null;
      }

      const native = scValToNative(sim.result.retval) as Record<
        string,
        unknown
      >;
      return {
        question: native.question != null ? String(native.question) : null,
        description:
          native.description != null ? String(native.description) : null,
        createdAt:
          native.created_at != null ? Number(native.created_at) : null,
      };
    } catch (err) {
      this.log?.debug(
        { err: String(err), marketId: marketId.toString() },
        "getMarketMeta error",
      );
      return null;
    }
  }
}

function normalizeRpcEvent(ev: rpc.Api.EventResponse): RawIndexerEvent {
  const topics = (ev.topic ?? []).map((t) => {
    try {
      return scValToNative(t);
    } catch {
      return t;
    }
  });

  let value: unknown = ev.value;
  try {
    value = scValToNative(ev.value);
  } catch {
    /* keep raw */
  }

  let eventIndex = 0;
  if (typeof ev.id === "string") {
    const parts = ev.id.split("-");
    const last = parts[parts.length - 1];
    const n = Number(last);
    if (Number.isFinite(n)) eventIndex = n;
  }

  return {
    txHash: ev.txHash,
    eventIndex,
    ledger: ev.ledger,
    timestamp: ev.ledgerClosedAt,
    topics,
    value,
  };
}

/** Sleep helper for backoff. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function computeBackoffMs(
  attempt: number,
  baseMs = 1000,
  maxMs = 60_000,
): number {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * 250);
  return exp + jitter;
}
