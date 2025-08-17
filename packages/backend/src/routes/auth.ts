```ts
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

/* ──────────────────────────────────────────────────────────────────────────────
 *  Constants & Types
 * ────────────────────────────────────────────────────────────────────────────── */

type SetupQuery = {
  installation_id?: string;
  setup_action?: "install" | string;
};

type AuthCallbackQuery = {
  code?: string;
  state?: string;
};

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

interface GitHubUser {
  login: string;
}

const GITHUB_OAUTH_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_API = "https://api.github.com/user";

/* ──────────────────────────────────────────────────────────────────────────────
 *  Helpers
 * ────────────────────────────────────────────────────────────────────────────── */

const baseUrl = (): string =>
  env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : "https://ollama-turbo-agent.liviogama.com";

const redirect = (
  reply: FastifyReply,
  path: string,
  status = 302,
): FastifyReply => reply.redirect(status, `${baseUrl()}${path}`);

const parseInstallationId = (value?: string): number => {
  if (!value) throw new Error("Missing `installation_id` query parameter");
  const id = Number(value);
  if (!Number.isInteger(id) || id < 0) {
    throw new Error("`installation_id` must be a positive integer");
  }
  return id;
};

const extractAccountInfo = (inst: GitHubInstallation) => {
  const { id, account } = inst;
  const login = account.login ?? account.slug;
  if (!login) throw new Error("Installation account login cannot be determined");

  const type: "Organization" | "User" =
    account.type === "Organization" ? "Organization" : "User";

  return { id, login, type };
};

const axiosInstance = axios.create({
  headers: {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
  },
});

/* ──────────────────────────────────────────────────────────────────────────────
 *  Route Options (schemas, typings)
 * ────────────────────────────────────────────────────────────────────────────── */

const setupOpts: RouteShorthandOptions = {
  schema: {
    querystring: {
      installation_id: { type: "string" },
      setup_action: { type: "string", enum: ["install"] },
    },
    response: {
      302: { type: "null" },
      400: { type: "object", properties: { error: { type: "string" } } },
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
      400: { type: "object", properties: { error: { type: "string" } } },
    },
  },
};

/* ──────────────────────────────────────────────────────────────────────────────
 *  Route Handlers
 * ────────────────────────────────────────────────────────────────────────────── */

export async function authRoutes(fastify: FastifyInstance) {
  /* ------------------------------- /setup ----------------------------------- */
  fastify.get("/setup", setupOpts, async (req, reply) => {
    let installationId: number;

    try {
      installationId = parseInstallationId(req.query.installation_id);
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }

    try {
      if (req.query.setup_action === "install") {
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

        fastify.log.info(
          `GitHub App installed for ${login} (installation ID: ${installationId})`,
        );
      }

      return redirect(reply, `/setup/success?installation_id=${installationId}`);
    } catch (error) {
      fastify.log.error(error, `Setup failed for installation ${installationId}`);
      return redirect(reply, "/setup/error");
    }
  });

  /* -------------------------- /auth/callback ------------------------------- */
  fastify.get(
    "/auth/callback",
    authCallbackOpts,
    async (req: FastifyRequest<{ Querystring: AuthCallbackQuery }>, reply) => {
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
        if (!accessToken) throw new Error("GitHub did not return an access token");

        const userRes = await axiosInstance.get<GitHubUser>(GITHUB_USER_API, {
          headers: { Authorization: `token ${accessToken}` },
        });

        const { login } = userRes.data;
        if (!login) throw new Error("GitHub user payload missing `login`");

        fastify.log.info(`User ${login} authenticated via GitHub OAuth`);
        return redirect(reply, `/auth/success?user=${encodeURIComponent(login)}`);
      } catch (error) {
        fastify.log.error(error, "OAuth callback failed");
        return redirect(reply, "/auth/error");
      }
    },
  );

  /* -------------------------- /auth/installations --------------------------- */
  fastify.get("/auth/installations", async (_req, reply) => {
    try {
      const rows = await db.select().from(installations);
      return reply.send({ success: true, installations: rows });
    } catch (error) {
      fastify.log.error(error, "Failed to fetch installations");
      return reply.code(500).send({ error: "Unable to retrieve installations" });
    }
  });
}
```