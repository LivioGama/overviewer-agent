```ts
import axios from "axios";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { env } from "../config/env.js";
import { db } from "../database/connection.js";
import { installations } from "../database/schema.js";
import { githubService } from "../services/github.js";

type SetupQuery = {
  installation_id?: string;
  setup_action?: string;
};

type CallbackQuery = {
  code?: string;
  state?: string;
};

const isDev = env.NODE_ENV === "development";

const getRedirectUrl = (path: string, params: Record<string, string> = {}): string => {
  const base = isDev ? "http://localhost:3000" : "https://ollama-turbo-agent.liviogama.com";
  const url = new URL(`${base}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
};

export async function authRoutes(app: FastifyInstance) {
  app.get(
    "/setup",
    async (req: FastifyRequest<{ Querystring: SetupQuery }>, reply: FastifyReply) => {
      const { installation_id, setup_action } = req.query;

      if (!installation_id) {
        return reply.code(400).send({ error: "Missing installation_id parameter" });
      }

      const installationId = Number(installation_id);
      if (!Number.isInteger(installationId) || installationId <= 0) {
        return reply.code(400).send({ error: "Invalid installation_id parameter" });
      }

      try {
        if (setup_action === "install") {
          const installation = await githubService.getInstallation(installationId);
          if (!installation?.account) {
            throw new Error("Invalid installation data received from GitHub");
          }

          const { account, permissions = {} } = installation;
          const accountId = account.id;
          const accountLogin = "login" in account ? account.login : (account as any).slug;
          const accountType = "type" in account ? account.type : "Organization";

          if (!accountId || !accountLogin) {
            throw new Error("Missing required account information");
          }

          await db
            .insert(installations)
            .values({
              id: installation.id,
              accountId,
              accountLogin,
              accountType: accountType as "Organization" | "User",
              permissions,
            })
            .onConflictDoUpdate({
              target: installations.id,
              set: {
                accountId,
                accountLogin,
                accountType: accountType as "Organization" | "User",
                permissions,
                updatedAt: new Date(),
              },
            });

          app.log.info(`GitHub App installed for ${accountLogin} (ID: ${installationId})`);
        }

        const redirect = getRedirectUrl("/setup/success", { installation_id: installationId.toString() });
        return reply.redirect(302, redirect);
      } catch (err) {
        app.log.error(err, `Setup failed for installation ${installationId}`);
        const redirect = getRedirectUrl("/setup/error");
        return reply.redirect(302, redirect);
      }
    },
  );

  app.get(
    "/auth/callback",
    async (req: FastifyRequest<{ Querystring: CallbackQuery }>, reply: FastifyReply) => {
      const { code, state } = req.query;

      if (!code) {
        return reply.code(400).send({ error: "Missing authorization code" });
      }

      try {
        const tokenRes = await axios.post(
          "https://github.com/login/oauth/access_token",
          new URLSearchParams({
            client_id: env.GITHUB_CLIENT_ID,
            client_secret: env.GITHUB_CLIENT_SECRET,
            code,
            ...(state && { state }),
          }),
          {
            headers: {
              Accept: "application/json",
              "Content-Type": "application/x-www-form-urlencoded",
            },
          },
        );

        const tokenData = tokenRes.data;
        if (tokenData.error) {
          throw new Error(
            tokenData.error_description ?? tokenData.error ?? "GitHub OAuth error",
          );
        }
        if (!tokenData.access_token) {
          throw new Error("No access token received from GitHub");
        }

        const userRes = await axios.get("https://api.github.com/user", {
          headers: {
            Authorization: `token ${tokenData.access_token}`,
            Accept: "application/vnd.github.v3+json",
          },
        });

        const user = userRes.data;
        if (!user.login) {
          throw new Error("Invalid user data received from GitHub");
        }

        app.log.info(`User ${user.login} authorized via OAuth`);
        const redirect = getRedirectUrl("/auth/success", { user: user.login });
        return reply.redirect(302, redirect);
      } catch (err) {
        app.log.error(err, "OAuth callback failed");
        const redirect = getRedirectUrl("/auth/error");
        return reply.redirect(302, redirect);
      }
    },
  );

  app.get("/auth/installations", async (_req, reply: FastifyReply) => {
    try {
      const rows = await db.select().from(installations);
      return reply.send({ success: true, installations: rows });
    } catch (err) {
      app.log.error(err, "Failed to fetch installations");
      return reply.code(500).send({ error: "Failed to fetch installations" });
    }
  });
}
```