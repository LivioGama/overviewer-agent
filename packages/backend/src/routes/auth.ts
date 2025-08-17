```ts
import axios from "axios";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { db } from "../database/connection.js";
import { installations } from "../database/schema.js";
import { githubService } from "../services/github.js";

/* -------------------------------------------------------------------------- */
/*                      Helper Types & Constants                               */
/* -------------------------------------------------------------------------- */

type SetupQuery = {
  installation_id?: string;
  setup_action?: string;
};

type AuthCallbackQuery = {
  code?: string;
  state?: string;
};

const GITHUB_OAUTH_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_API = "https://api.github.com/user";

const getBaseUrl = (): string =>
  env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : "https://ollama-turbo-agent.liviogama.com";

const redirect = (reply: FastifyReply, path: string, status = 302) =>
  reply.redirect(status, `${getBaseUrl()}${path}`);

const parseInstallationId = (value?: string): number => {
  if (!value) throw new Error("Missing installation_id parameter");
  const id = Number(value);
  if (!Number.isInteger(id) || id < 0) {
    throw new Error("Invalid installation_id parameter");
  }
  return id;
};

type AccountInfo = {
  id: number;
  login: string;
  type: "Organization" | "User";
};

const extractAccountInfo = (inst: any): AccountInfo => {
  const { id, account } = inst;
  if (!account) throw new Error("Installation data missing account information");

  const login: string = "login" in account ? account.login : account.slug;
  if (!login) throw new Error("Account login could not be determined");

  const type: "Organization" | "User" =
    (account.type as string) === "Organization" ? "Organization" : "User";

  return { id, login, type };
};

/* -------------------------------------------------------------------------- */
/*                              Route Handlers                                 */
/* -------------------------------------------------------------------------- */

export async function authRoutes(fastify: FastifyInstance) {
  /* --------------------------- /setup ------------------------------------ */
  fastify.get("/setup", async (req: FastifyRequest<{ Querystring: SetupQuery }>, reply) => {
    let installationId: number;

    try {
      installationId = parseInstallationId(req.query.installation_id);
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }

    try {
      if (req.query.setup_action === "install") {
        const installation = await githubService.getInstallation(installationId);
        if (!installation) throw new Error("No installation data received from GitHub");

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

        fastify.log.info(`GitHub App installed for ${login} (ID: ${installationId})`);
      }

      redirect(reply, `/setup/success?installation_id=${installationId}`);
    } catch (err) {
      fastify.log.error(err, `Setup failed for installation ${installationId}`);
      redirect(reply, "/setup/error");
    }
  });

  /* --------------------- /auth/callback ---------------------------------- */
  fastify.get(
    "/auth/callback",
    async (req: FastifyRequest<{ Querystring: AuthCallbackQuery }>, reply) => {
      const { code, state } = req.query;

      if (!code) {
        return reply.code(400).send({ error: "Missing authorization code" });
      }

      try {
        const tokenRes = await axios.post(
          GITHUB_OAUTH_TOKEN_URL,
          new URLSearchParams({
            client_id: env.GITHUB_CLIENT_ID,
            client_secret: env.GITHUB_CLIENT_SECRET,
            code,
            ...(state && { state }),
          }).toString(),
          {
            headers: {
              Accept: "application/json",
              "Content-Type": "application/x-www-form-urlencoded",
            },
          }
        );

        const { access_token: accessToken, error, error_description: errorDesc } = tokenRes.data;

        if (error) {
          throw new Error(`GitHub OAuth error: ${errorDesc ?? error}`);
        }
        if (!accessToken) throw new Error("No access token received from GitHub");

        const userRes = await axios.get(GITHUB_USER_API, {
          headers: {
            Authorization: `token ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        });

        const { login } = userRes.data;
        if (!login) throw new Error("Invalid user data received from GitHub");

        fastify.log.info(`User ${login} authorized via OAuth`);
        redirect(reply, `/auth/success?user=${encodeURIComponent(login)}`);
      } catch (err) {
        fastify.log.error(err, "OAuth callback failed");
        redirect(reply, "/auth/error");
      }
    }
  );

  /* ------------------- /auth/installations -------------------------------- */
  fastify.get("/auth/installations", async (_req: FastifyRequest, reply) => {
    try {
      const rows = await db.select().from(installations);
      return reply.send({ success: true, installations: rows });
    } catch (err) {
      fastify.log.error(err, "Failed to fetch installations");
      return reply.code(500).send({ error: "Failed to fetch installations" });
    }
  });
}
```