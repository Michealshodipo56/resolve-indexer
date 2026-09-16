import type { FastifyPluginAsync } from "fastify";
import { getCheckpoint, getCheckpointUpdatedAt } from "../db/queries.js";

export type HealthDeps = {
  getCursor: () => string | null;
  getLastIngestAt: () => string | null;
};

export const healthRoutes: FastifyPluginAsync<{ deps: HealthDeps }> = async (
  app,
  opts,
) => {
  app.get("/health", async (_req, reply) => {
    const cursor =
      opts.deps.getCursor() ?? getCheckpoint(app.db) ?? null;
    const lastIngestAt =
      opts.deps.getLastIngestAt() ?? getCheckpointUpdatedAt(app.db);

    return reply.send({
      status: "ok",
      cursor,
      lastIngestAt,
    });
  });
};

declare module "fastify" {
  interface FastifyInstance {
    db: import("../db/index.js").SqliteDb;
  }
}
