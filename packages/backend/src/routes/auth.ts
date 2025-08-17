import axios from "axios";
import { FastifyInstance } from "fastify";
import { env } from "../config/env.js";
import { db } from "../database/connection.js";
import { installations } from "../database/schema.js";
import { githubService } from "../services/github.js";

export async function authRoutes(fastify: FastifyInstance) {
  fastify.get("/setup", async (request, reply) => {
    const { installation_id, setup_action } = request.query as {
      installation_id?: string;
      setup_action?: string;
    };

    if (!installation_id) {
      return reply.code(400).send({
        error: "Missing installation_id parameter",
      });
    }

    const installationId = parseInt(installation_id, 10);
    if (isNaN(installationId)) {
      return reply.code(400).send({
        error: "Invalid installation_id parameter",
      });
    }

    try {
      if (setup_action === "install") {
        const installationData =
          await githubService.getInstallation(installationId);

        fastify.log.info(
          `Installation data received: ${JSON.stringify(installationData, null, 2)}`,
        );

        if (!installationData) {
          throw new Error("No installation data received from GitHub");
        }

        const account = installationData.account;
        if (!account) {
          throw new Error("No account information in installation data");
        }

        const accountId = account.id;
        let accountLogin: string;
        let accountType: string;

        if ("login" in account) {
          accountLogin = account.login as string;
          accountType = (account as any).type || "User";
        } else if ("slug" in account) {
          accountLogin = account.slug as string;
          accountType = "Organization";
        } else {
          throw new Error(
            `Cannot determine account login. Account properties: ${Object.keys(account).join(", ")}`,
          );
        }

        if (!accountId || !accountLogin) {
          throw new Error(
            `Missing required account information: id=${accountId}, login=${accountLogin}`,
          );
        }

        await db
          .insert(installations)
          .values({
            id: installationData.id,
            accountId: accountId,
            accountLogin: accountLogin,
            accountType: accountType as "Organization" | "User",
            permissions: installationData.permissions || {},
          })
          .onConflictDoUpdate({
            target: installations.id,
            set: {
              accountId: accountId,
              accountLogin: accountLogin,
              accountType: accountType as "Organization" | "User",
              permissions: installationData.permissions || {},
              updatedAt: new Date(),
            },
          });

        fastify.log.info(
          `GitHub App installed for ${accountLogin} (ID: ${installationId})`,
        );
      }

      const redirectUrl =
        env.NODE_ENV === "development"
          ? `http://localhost:3000/setup/success?installation_id=${installationId}`
          : `https://ollama-turbo-agent.liviogama.com/setup/success?installation_id=${installationId}`;

      return reply.redirect(302, redirectUrl);
    } catch (error) {
      fastify.log.error(
        error,
        `Setup failed for installation ${installationId}`,
      );

      const redirectUrl =
        env.NODE_ENV === "development"
          ? `http://localhost:3000/setup/error`
          : `https://ollama-turbo-agent.liviogama.com/setup/error`;

      return reply.redirect(302, redirectUrl);
    }
  });

  fastify.get("/auth/callback", async (request, reply) => {
    const { code, state } = request.query as {
      code?: string;
      state?: string;
    };

    if (!code) {
      return reply.code(400).send({
        error: "Missing authorization code",
      });
    }

    try {
      const tokenResponse = await axios.post(
        "https://github.com/login/oauth/access_token",
        new URLSearchParams({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code: code,
          ...(state && { state }),
        }),
        {
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      );

      const tokenData = tokenResponse.data;

      if (tokenData.error) {
        throw new Error(
          `GitHub OAuth error: ${tokenData.error_description || tokenData.error}`,
        );
      }

      if (!tokenData.access_token) {
        throw new Error("No access token received from GitHub");
      }

      const userResponse = await axios.get("https://api.github.com/user", {
        headers: {
          Authorization: `token ${tokenData.access_token}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      const userData = userResponse.data;

      if (!userData.login) {
        throw new Error("Invalid user data received from GitHub");
      }

      fastify.log.info(`User ${userData.login} authorized via OAuth`);

      const redirectUrl =
        env.NODE_ENV === "development"
          ? `http://localhost:3000/auth/success?user=${userData.login}`
          : `https://ollama-turbo-agent.liviogama.com/auth/success?user=${userData.login}`;

      return reply.redirect(302, redirectUrl);
    } catch (error) {
      fastify.log.error(error, "OAuth callback failed");

      const redirectUrl =
        env.NODE_ENV === "development"
          ? `http://localhost:3000/auth/error`
          : `https://ollama-turbo-agent.liviogama.com/auth/error`;

      return reply.redirect(302, redirectUrl);
    }
  });

  fastify.get("/auth/installations", async (_request, reply) => {
    try {
      const allInstallations = await db.select().from(installations);

      return reply.send({
        success: true,
        installations: allInstallations,
      });
    } catch (error) {
      fastify.log.error(error, "Failed to fetch installations");
      return reply.code(500).send({
        error: "Failed to fetch installations",
      });
    }
  });
}
