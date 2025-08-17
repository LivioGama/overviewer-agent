```ts
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import axios from "axios";
import {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  RouteShorthandOptions,
} from "fastify";

import { env } from "../config/env.js";
import { db } from "../database/connection.js";
import { installations } from "../database/schema.js";
import { githubService } from "../services/github.js";

/* ────────────────────────────────────────
   Types, Enums & Constants
   ──────────────────────────────────────── */

enum SetupAction {
  Install = "install",
}

/** Query string for the `/setup` endpoint. */
type SetupQuery = {
  installation_id?: string;
  setup_action?: SetupAction | string;
};

/** Query string for the OAuth callback endpoint. */
type AuthCallbackQuery = {
  code?: string;
  state?: string;
};

/** Minimal shape of a GitHub installation returned by the service. */
interface GitHubInstallation {
  id: number;
  account: {
    id: number;
    login?: string;
    slug?: string;
    type?: "Organization" | string;
  };
  permissions?: Record<string, unknown>;
}

/** Minimal shape of a GitHub user payload. */
interface GitHubUser {
  login: string;
}

/** URLs used by the OAuth flow. */
const GITHUB_OAUTH_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_API = "https://api.github.com/user";

/* ────────────────────────────────────────
   Helper utilities
   ──────────────────────────────────────── */

/**
 * Returns the public base URL of the application.
 * In development we point to localhost, otherwise to the
 * production host defined by the deployment.
 */
const getBaseUrl = (): string =>
  env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : "https://ollama-turbo-agent.liviogama.com";

/**
 * Shortcut for `reply.redirect(...)` that automatically prefixes the
 * path with the public base URL.
 */
const redirect = (
  reply: FastifyReply,
  path: string,
  status = 302,
): FastifyReply => reply.redirect(status, `${getBaseUrl()}${path}`);

/**
 * Parses the `installation_id` query parameter.
 * Throws a descriptive error if the value is missing or invalid.
 */
const parseInstallationId = (value?: string): number => {
  if (!value) throw new Error("Missing `installation_id` query parameter");
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0) {
    throw new Error("`installation_id` must be a positive integer");
  }
  return num;
};

/**
 * Extracts the required account information from a GitHub installation.
 */
const extractAccountInfo = (inst: GitHubInstallation) => {
  const { id, account } = inst;
  const login = account.login ?? account.slug;
  if (!login) throw new Error("Installation account login cannot be determined");

  const type = account.type === "Organization" ? "Organization" : "User";
  return { id, login, type };
};

/** Pre‑configured Axios instance used for GitHub API calls. */
const axiosInstance = axios.create({
  headers: {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
  },
});

/* ────────────────────────────────────────
   Fastify route schemas
   ──────────────────────────────────────── */

const setupOpts: RouteShorthandOptions = {
  schema: {
    querystring: {
      installation_id: { type: "string" },
      setup_action: { type: "string", enum: [SetupAction.Install] },
    },
    response: {
      302: { type: "null" },
      400: {
        type: "object",
        properties: { error: { type: "string" } },
      },
    },
  },
};

const authCallbackOpts: RouteShorthandOptions = {
  schema: {
    querystring: {
      code: { type: "string" },
      state: { type: "string", nullable: true },
    },
    response: {
      302: { type: "null" },
      400: {
        type: "object",
        properties: { error: { type: "string" } },
      },
    },
  },
};

/* ────────────────────────────────────────
   Route registration
   ──────────────────────────────────────── */

export async function authRoutes(app: FastifyInstance) {
  /* ---------- /setup ------------------------------------------------- */
  app.get(
    "/setup",
    setupOpts,
    async (
      req: FastifyRequest<{ Querystring: SetupQuery }>,
      reply,
    ): Promise<FastifyReply> => {
      let installationId: number;

      try {
        installationId = parseInstallationId(req.query.installation_id);
      } catch (e) {
        return reply.code(400).send({ error: (e as Error).message });
      }

      try {
        // Only persist installation data when the action is an explicit install.
        if (req.query.setup_action === SetupAction.Install) {
          const installation = await githubService.getInstallation(installationId);
          if (!installation) throw new Error("GitHub returned no installation data");

          const { id, login, type } = extractAccountInfo(installation);
          const permissions = installation.permissions ?? {};

          await db
            .insert(installations)
            .values({
              id,
              accountId: installation.account.id,
              accountLogin: login,
              accountType: type,
              permissions,
            })
            .onConflictDoUpdate({
              target: installations.id,
              set: {
                accountId: installation.account.id,
                accountLogin: login,
                accountType: type,
                permissions,
                updatedAt: new Date(),
              },
            });

          app.log.info(
            `GitHub App installed for ${login} (installation ID: ${installationId})`,
          );
        }

        return redirect(reply, `/setup/success?installation_id=${installationId}`);
      } catch (e) {
        app.log.error(e, `Setup failed for installation ${installationId}`);
        return redirect(reply, "/setup/error");
      }
    },
  );

  /* ---------- /auth/callback ----------------------------------------- */
  app.get(
    "/auth/callback",
    authCallbackOpts,
    async (
      req: FastifyRequest<{ Querystring: AuthCallbackQuery }>,
      reply,
    ): Promise<FastifyReply> => {
      const { code, state } = req.query;

      if (!code) {
        return reply.code(400).send({ error: "Missing `code` query parameter" });
      }

      try {
        const tokenRes = await axiosInstance.post(
          GITHUB_OAUTH_TOKEN_URL,
          new URLSearchParams({
            client_id: env.GITHUB_CLIENT_ID,
            client_secret: env.GITHUB_CLIENT_SECRET,
            code,
            ...(state && { state }),
          }).toString(),
        );

        const {
          access_token: accessToken,
          error,
          error_description: errorDesc,
        } = tokenRes.data as {
          access_token?: string;
          error?: string;
          error_description?: string;
        };

        if (error) {
          throw new Error(`GitHub OAuth error: ${errorDesc ?? error}`);
        }
        if (!accessToken) {
          throw new Error("GitHub did not return an access token");
        }

        const userRes = await axiosInstance.get<GitHubUser>(GITHUB_USER_API, {
          headers: { Authorization: `token ${accessToken}` },
        });

        const { login } = userRes.data;
        if (!login) throw new Error("GitHub user payload missing `login`");

        app.log.info(`User ${login} authenticated via GitHub OAuth`);
        return redirect(
          reply,
          `/auth/success?user=${encodeURIComponent(login)}`,
        );
      } catch (e) {
        app.log.error(e, "OAuth callback failed");
        return redirect(reply, "/auth/error");
      }
    },
  );

  /* ---------- /auth/installations ------------------------------------- */
  app.get("/auth/installations", async (_req, reply) => {
    try {
      const rows = await db.select().from(installations);
      return reply.send({ success: true, installations: rows });
    } catch (e) {
      app.log.error(e, "Failed to fetch installations");
      return reply.code(500).send({ error: "Unable to retrieve installations" });
    }
  });
}
```