import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool, PoolClient } from "pg";
import { randomBytes, randomUUID } from "node:crypto";
import { withWorkspace } from "../../../../../packages/database/src/client.js";
import {
  current,
  csrfMatches,
  type IdentityRuntime,
} from "../identity/routes.js";
import { DomainError, hash, match, tag } from "../projects/core.js";
import { problem } from "../projects/routes.js";
import {
  IG_SCOPES,
  instagramConfig,
  sealToken,
  openToken,
  tokenContext,
} from "./config.js";
import {
  exchangeCode,
  refreshToken,
  InstagramError,
  type InstagramProvider,
} from "./provider.js";
const publicConnection = (row: any) => ({
  id: row.id,
  revision: Number(row.revision),
  displayName: row.display_name,
  status: row.status,
  grantedScopes: row.granted_scopes,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
});
const connection = async (c: PoolClient) =>
  (
    await c.query(
      "SELECT * FROM newbert.instagram_connections WHERE status IN ('active','reauth_required') ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
    )
  ).rows[0];
async function lock(c: PoolClient, workspace: string) {
  await c.query("SELECT id FROM newbert.workspaces WHERE id=$1 FOR UPDATE", [
    workspace,
  ]);
}
async function audit(
  c: PoolClient,
  a: any,
  action: string,
  target: string,
  requestId: string,
) {
  await c.query(
    "INSERT INTO newbert.audit_events(id,workspace_id,actor_user_id,action,target_type,target_id,request_id) VALUES($1,$2,$3,$4,'instagram_connection',$5,$6)",
    [
      randomUUID(),
      a.domain.workspace_id,
      a.domain.user_id,
      action,
      target,
      requestId,
    ],
  );
}
async function pause(c: PoolClient, id: string, reason: string) {
  await c.query("SELECT newbert.pause_instagram_deliveries($1,$2)", [
    id,
    reason,
  ]);
}
async function expire(c: PoolClient, row: any) {
  if (
    row?.status === "active" &&
    (!row.expires_at || new Date(row.expires_at).getTime() <= Date.now())
  ) {
    row = (
      await c.query(
        "UPDATE newbert.instagram_connections SET status='reauth_required',revision=revision+1 WHERE id=$1 RETURNING *",
        [row.id],
      )
    ).rows[0];
    await pause(c, row.id, "connection_expired");
  }
  return row;
}
export function registerInstagramRoutes(
  app: FastifyInstance,
  pool: Pool,
  identity: IdentityRuntime,
  provider: InstagramProvider = { exchangeCode, refreshToken },
) {
  async function auth(
    r: FastifyRequest,
    reply: FastifyReply,
    mutating = false,
  ) {
    reply.header("Referrer-Policy", "no-referrer");
    const a = await current(r, reply, identity);
    if (!a) return;
    if (
      mutating &&
      (r.headers.origin !== identity.config.origin ||
        !csrfMatches(a.csrfToken, r.headers["x-csrf-token"]))
    ) {
      problem(
        reply,
        r,
        403,
        "CSRF_REJECTED",
        "Use the trusted app and refresh your session.",
      );
      return;
    }
    return a;
  }
  function fail(e: unknown, r: FastifyRequest, reply: FastifyReply) {
    if (e instanceof DomainError)
      return problem(reply, r, e.status, e.code, e.message);
    if (e instanceof InstagramError)
      return problem(
        reply,
        r,
        503,
        e.code,
        "Instagram could not verify this connection. Retry later or reconnect.",
      );
    if ((e as any)?.code === "23505")
      return problem(
        reply,
        r,
        409,
        "INSTAGRAM_ACCOUNT_UNAVAILABLE",
        "This Instagram account is unavailable for this connection.",
      );
    return problem(
      reply,
      r,
      503,
      "INSTAGRAM_UNAVAILABLE",
      "Instagram connection could not be updated.",
    );
  }
  app.get("/api/v1/instagram/connection", async (r, reply) => {
    const a = await auth(r, reply);
    if (!a) return;
    try {
      return await withWorkspace(pool, a.domain.workspace_id, async (c) => {
        await lock(c, a.domain.workspace_id);
        const row = await expire(c, await connection(c)),
          cfg = instagramConfig(identity.config.origin);
        if (row) reply.header("ETag", tag("instagram", row));
        return {
          connection: row ? publicConnection(row) : null,
          setup: {
            configured: cfg.configured,
            missing: cfg.missing,
            requiredScopes: IG_SCOPES,
            professionalAccountRequired: true,
            publishingAvailable: false,
          },
        };
      });
    } catch (e) {
      return fail(e, r, reply);
    }
  });
  app.post(
    "/api/v1/instagram/authorization",
    {
      schema: {
        body: {
          $ref: "https://newbert.local/contract#/definitions/InstagramAuthorize",
        },
      },
    },
    async (r, reply) => {
      const a = await auth(r, reply, true);
      if (!a) return;
      const cfg = instagramConfig(identity.config.origin);
      if (!cfg.configured)
        return problem(
          reply,
          r,
          503,
          "INSTAGRAM_SETUP_REQUIRED",
          "Meta app configuration and encrypted token storage must be configured by the operator.",
        );
      try {
        const state = randomBytes(32).toString("hex");
        const expiresAt = await withWorkspace(
          pool,
          a.domain.workspace_id,
          async (c) => {
            await lock(c, a.domain.workspace_id);
            let row = await connection(c);
            if (row) match(r.headers["if-match"], tag("instagram", row));
            const recent = (
              await c.query(
                "SELECT count(*)::int AS n FROM newbert.oauth_states WHERE created_at>now()-interval '10 minutes'",
              )
            ).rows[0].n;
            if (recent >= 10)
              throw new DomainError(
                429,
                "INSTAGRAM_AUTH_RATE_LIMIT",
                "Too many sign-in attempts. Wait ten minutes.",
              );
            if (row) {
              row = (
                await c.query(
                  "UPDATE newbert.instagram_connections SET status='reauth_required',revision=revision+1 WHERE id=$1 RETURNING *",
                  [row.id],
                )
              ).rows[0];
              await pause(c, row.id, "connection_changed");
            }
            await c.query(
              "UPDATE newbert.oauth_states SET consumed_at=now() WHERE consumed_at IS NULL",
            );
            const generation = (
              await c.query(
                "UPDATE newbert.workspaces SET instagram_revision=instagram_revision+1 WHERE id=$1 RETURNING instagram_revision",
                [a.domain.workspace_id],
              )
            ).rows[0].instagram_revision;
            const result = (
              await c.query(
                "INSERT INTO newbert.oauth_states(id,workspace_id,state_hash,session_binding_hash,return_path,expires_at,context) VALUES($1,$2,$3,$4,$5,now()+interval '10 minutes',$6) RETURNING expires_at",
                [
                  randomUUID(),
                  a.domain.workspace_id,
                  hash(state),
                  hash(a.csrfToken),
                  (r.body as any).returnPath,
                  JSON.stringify({
                    generation: Number(generation),
                    connectionId: row?.id ?? null,
                    revision: row ? Number(row.revision) : null,
                    config: cfg.fingerprint,
                  }),
                ],
              )
            ).rows[0];
            return result.expires_at;
          },
        );
        const url = new URL("https://www.instagram.com/oauth/authorize");
        url.search = new URLSearchParams({
          client_id: cfg.appId,
          redirect_uri: cfg.redirect,
          response_type: "code",
          scope: IG_SCOPES.join(","),
          state,
          enable_fb_login: "false",
          force_reauth: "true",
        }).toString();
        return { authorizationUrl: url.href, expiresAt };
      } catch (e) {
        return fail(e, r, reply);
      }
    },
  );
  app.get("/api/v1/instagram/callback", async (r, reply) => {
    const a = await auth(r, reply);
    if (!a) return;
    const q = r.query as Record<string, unknown>;
    const destination = (path: string, result: string) =>
      reply.redirect(identity.config.origin + path + "?instagram=" + result);
    if (typeof q.state !== "string" || !/^[a-f0-9]{64}$/.test(q.state))
      return destination("/app/settings", "invalid_state");
    const cfg = instagramConfig(identity.config.origin);
    try {
      const state = await withWorkspace(
        pool,
        a.domain.workspace_id,
        async (c) =>
          (
            await c.query(
              "UPDATE newbert.oauth_states SET consumed_at=now() WHERE state_hash=$1 AND session_binding_hash=$2 AND consumed_at IS NULL AND expires_at>now() RETURNING *",
              [hash(q.state), hash(a.csrfToken)],
            )
          ).rows[0],
      );
      if (!state) return destination("/app/settings", "invalid_state");
      const path = ["/app/settings", "/app/publishing"].includes(
        state.return_path,
      )
        ? state.return_path
        : "/app/settings";
      if (q.error !== undefined) return destination(path, "cancelled");
      if (!cfg.configured || state.context.config !== cfg.fingerprint)
        return destination(path, "setup_changed");
      if (
        typeof q.code !== "string" ||
        q.code.length < 1 ||
        q.code.length > 4096
      )
        return destination(path, "invalid_code");
      // State consumption commits before exchange. An ambiguous external request is
      // never replayed by refreshing the callback URL.
      const grant = await provider.exchangeCode(cfg, q.code);
      const newId = randomUUID(),
        secretId = randomUUID();
      await withWorkspace(pool, a.domain.workspace_id, async (c) => {
        await lock(c, a.domain.workspace_id);
        const epoch = (
          await c.query(
            "SELECT instagram_revision FROM newbert.workspaces WHERE id=$1",
            [a.domain.workspace_id],
          )
        ).rows[0].instagram_revision;
        if (Number(epoch) !== state.context.generation)
          throw new DomainError(
            409,
            "CONNECTION_CHANGED",
            "Restart authorization.",
          );
        const prior = await connection(c);
        if (
          (prior?.id ?? null) !== state.context.connectionId ||
          (prior ? Number(prior.revision) : null) !== state.context.revision
        )
          throw new DomainError(
            409,
            "CONNECTION_CHANGED",
            "Restart Instagram authorization.",
          );
        if (prior) {
          await pause(c, prior.id, "connection_changed");
          await c.query(
            "UPDATE newbert.instagram_connections SET status='disconnected',secret_ref='revoked',revision=revision+1,disconnected_at=now() WHERE id=$1",
            [prior.id],
          );
          await c.query(
            "DELETE FROM newbert.instagram_secrets WHERE connection_id=$1",
            [prior.id],
          );
        }
        await c.query(
          "INSERT INTO newbert.instagram_connections(id,workspace_id,remote_account_id,display_name,status,secret_ref,granted_scopes,expires_at) VALUES($1,$2,$3,$4,'active',$5,$6,$7)",
          [
            newId,
            a.domain.workspace_id,
            grant.remoteAccountId,
            grant.displayName,
            secretId,
            grant.scopes,
            grant.expiresAt,
          ],
        );
        await c.query(
          "INSERT INTO newbert.instagram_secrets(id,workspace_id,connection_id,envelope) VALUES($1,$2,$3,$4)",
          [
            secretId,
            a.domain.workspace_id,
            newId,
            JSON.stringify(
              sealToken(
                grant.token,
                cfg.key,
                tokenContext(a.domain.workspace_id, newId, secretId),
              ),
            ),
          ],
        );
        await audit(c, a, "instagram.connected", newId, r.id);
      });
      return destination(path, "connected");
    } catch (e) {
      const result =
        e instanceof InstagramError
          ? e.code.toLowerCase()
          : (e as any)?.code === "23505"
            ? "account_unavailable"
            : e instanceof DomainError
              ? "connection_changed"
              : "connection_failed";
      return destination("/app/settings", result);
    }
  });
  app.delete("/api/v1/instagram/connection", async (r, reply) => {
    const a = await auth(r, reply, true);
    if (!a) return;
    try {
      await withWorkspace(pool, a.domain.workspace_id, async (c) => {
        await lock(c, a.domain.workspace_id);
        const row = await connection(c);
        await c.query(
          "UPDATE newbert.workspaces SET instagram_revision=instagram_revision+1 WHERE id=$1",
          [a.domain.workspace_id],
        );
        if (row) {
          match(r.headers["if-match"], tag("instagram", row));
          await pause(c, row.id, "connection_disconnected");
          await c.query(
            "UPDATE newbert.instagram_connections SET status='disconnected',secret_ref='revoked',revision=revision+1,disconnected_at=now() WHERE id=$1",
            [row.id],
          );
          await c.query(
            "DELETE FROM newbert.instagram_secrets WHERE connection_id=$1",
            [row.id],
          );
          await audit(c, a, "instagram.disconnected", row.id, r.id);
        }
        await c.query(
          "UPDATE newbert.oauth_states SET consumed_at=now() WHERE consumed_at IS NULL",
        );
      });
      return reply.code(204).send();
    } catch (e) {
      return fail(e, r, reply);
    }
  });
  app.post("/api/v1/instagram/connection/refresh", async (r, reply) => {
    const a = await auth(r, reply, true);
    if (!a) return;
    const cfg = instagramConfig(identity.config.origin);
    if (!cfg.configured)
      return problem(
        reply,
        r,
        503,
        "INSTAGRAM_SETUP_REQUIRED",
        "Configure Meta and encrypted token storage first.",
      );
    try {
      const result = await withWorkspace(
        pool,
        a.domain.workspace_id,
        async (c) => {
          await lock(c, a.domain.workspace_id);
          let row = await connection(c);
          if (!row)
            throw new DomainError(404, "NOT_FOUND", "No Instagram connection.");
          match(r.headers["if-match"], tag("instagram", row));
          row = await expire(c, row);
          if (row.status !== "active") return { reauth: true };
          if (
            Date.now() -
              new Date(row.refreshed_at ?? row.created_at).getTime() <
            86400000
          )
            throw new DomainError(
              409,
              "INSTAGRAM_REFRESH_TOO_EARLY",
              "This connection was issued or renewed less than 24 hours ago.",
            );
          const saved = (
            await c.query(
              "SELECT envelope FROM newbert.instagram_secrets WHERE id=$1 AND connection_id=$2",
              [row.secret_ref, row.id],
            )
          ).rows[0];
          if (!saved) {
            await c.query(
              "UPDATE newbert.instagram_connections SET status='reauth_required',revision=revision+1 WHERE id=$1",
              [row.id],
            );
            await pause(c, row.id, "connection_reauth_required");
            return { reauth: true };
          }
          let token: string;
          try {
            token = openToken(
              saved.envelope,
              cfg.key,
              tokenContext(a.domain.workspace_id, row.id, row.secret_ref),
            );
          } catch {
            await c.query(
              "UPDATE newbert.instagram_connections SET status='reauth_required',revision=revision+1 WHERE id=$1",
              [row.id],
            );
            await pause(c, row.id, "connection_reauth_required");
            return { reauth: true };
          }
          let refreshed;
          try {
            refreshed = await provider.refreshToken(cfg, token);
          } catch (e) {
            if (
              e instanceof InstagramError &&
              e.code === "INSTAGRAM_REAUTH_REQUIRED"
            ) {
              await c.query(
                "UPDATE newbert.instagram_connections SET status='reauth_required',revision=revision+1 WHERE id=$1",
                [row.id],
              );
              await pause(c, row.id, "connection_reauth_required");
              return { reauth: true };
            }
            throw e;
          }
          const secretId = randomUUID();
          await c.query(
            "INSERT INTO newbert.instagram_secrets(id,workspace_id,connection_id,envelope) VALUES($1,$2,$3,$4)",
            [
              secretId,
              a.domain.workspace_id,
              row.id,
              JSON.stringify(
                sealToken(
                  refreshed.token,
                  cfg.key,
                  tokenContext(a.domain.workspace_id, row.id, secretId),
                ),
              ),
            ],
          );
          await c.query("DELETE FROM newbert.instagram_secrets WHERE id=$1", [
            row.secret_ref,
          ]);
          row = (
            await c.query(
              "UPDATE newbert.instagram_connections SET secret_ref=$2,expires_at=$3,refreshed_at=now(),revision=revision+1 WHERE id=$1 RETURNING *",
              [row.id, secretId, refreshed.expiresAt],
            )
          ).rows[0];
          await audit(c, a, "instagram.refreshed", row.id, r.id);
          return {
            connection: publicConnection(row),
            etag: tag("instagram", row),
            reauth: false,
          };
        },
      );
      if (result.reauth)
        return problem(
          reply,
          r,
          409,
          "INSTAGRAM_REAUTH_REQUIRED",
          "Reconnect Instagram before publishing.",
        );
      reply.header("ETag", result.etag!);
      return { connection: result.connection };
    } catch (e) {
      return fail(e, r, reply);
    }
  });
}
