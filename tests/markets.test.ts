import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { applyMigrations, openMemoryDatabase } from "../src/db/index.js";
import { applyRawEvent } from "../src/ingest/apply.js";
import { syntheticRawEvent } from "../src/ingest/decoder.js";
import { buildServer } from "../src/server.js";

const CREATOR = "G" + "A".repeat(55);
const RESOLVER = "G" + "B".repeat(55);
const TOKEN = "C" + "C".repeat(55);
const USER = "G" + "D".repeat(55);

describe("market listing API", () => {
  let app: FastifyInstance;

  before(async () => {
    const db = openMemoryDatabase();
    applyMigrations(db);
    app = await buildServer({
      db,
      logger: false,
      health: {
        getCursor: () => null,
        getLastIngestAt: () => null,
      },
    });
  });

  after(async () => {
    await app.close();
  });

  it("returns empty list when DB has no markets", async () => {
    const res = await app.inject({ method: "GET", url: "/markets" });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.deepEqual(body.markets, []);
    assert.equal(body.nextCursor, null);
  });

  it("lists markets after ingest and filters by status", async () => {
    applyRawEvent(
      app.db,
      syntheticRawEvent(
        ["market_created", 10n, CREATOR],
        {
          resolver: RESOLVER,
          token: TOKEN,
          close_at: 9_999n,
          resolution_timeout: 3600n,
        },
        { txHash: "f1".repeat(32), eventIndex: 0, ledger: 10 },
      ),
    );
    applyRawEvent(
      app.db,
      syntheticRawEvent(
        ["market_created", 11n, CREATOR],
        {
          resolver: RESOLVER,
          token: TOKEN,
          close_at: 9_999n,
          resolution_timeout: 3600n,
        },
        { txHash: "f2".repeat(32), eventIndex: 0, ledger: 11 },
      ),
    );
    applyRawEvent(
      app.db,
      syntheticRawEvent(
        ["market_resolved", 11n, RESOLVER],
        { outcome: 0 },
        { txHash: "f3".repeat(32), eventIndex: 0, ledger: 12 },
      ),
    );

    const all = await app.inject({ method: "GET", url: "/markets?limit=10" });
    assert.equal(all.statusCode, 200);
    assert.equal(all.json().markets.length, 2);

    const open = await app.inject({
      method: "GET",
      url: "/markets?status=open",
    });
    assert.equal(open.json().markets.length, 1);
    assert.equal(open.json().markets[0].id, 10);

    const one = await app.inject({ method: "GET", url: "/markets/10" });
    assert.equal(one.statusCode, 200);
    assert.equal(one.json().market.id, 10);

    const missing = await app.inject({ method: "GET", url: "/markets/999" });
    assert.equal(missing.statusCode, 404);

    applyRawEvent(
      app.db,
      syntheticRawEvent(
        ["staked", 10n, USER],
        { side: 1, amount: 25n, yes_pool: 0n, no_pool: 25n },
        { txHash: "f4".repeat(32), eventIndex: 0, ledger: 13 },
      ),
    );

    const positions = await app.inject({
      method: "GET",
      url: "/markets/10/positions",
    });
    assert.equal(positions.statusCode, 200);
    assert.equal(positions.json().positions.length, 1);

    const userPos = await app.inject({
      method: "GET",
      url: `/users/${USER}/positions`,
    });
    assert.equal(userPos.statusCode, 200);
    assert.equal(userPos.json().positions.length, 1);

    const activity = await app.inject({
      method: "GET",
      url: `/users/${USER}/activity`,
    });
    assert.equal(activity.statusCode, 200);
    assert.ok(activity.json().activity.length >= 1);

    const badAddr = await app.inject({
      method: "GET",
      url: "/users/not-an-address/positions",
    });
    assert.equal(badAddr.statusCode, 400);
  });

  it("never leaks stack traces on errors", async () => {
    const res = await app.inject({ method: "GET", url: "/nope" });
    assert.equal(res.statusCode, 404);
    assert.equal(res.json().error, "not_found");
    assert.equal(res.json().stack, undefined);
  });
});
