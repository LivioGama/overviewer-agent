import { RunnerService } from "./services/runner.js";

const runner = new RunnerService();

const start = async () => {
  try {
    console.log("Starting Overviewer Agent Runner...");

    const requiredEnvVars = [
      "REDIS_URL",
      "GITHUB_APP_ID",
      "GITHUB_APP_PRIVATE_KEY",
      "OPENAI_API_KEY",
    ];

    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
      }
    }

    await runner.start();
  } catch (error) {
    console.error("Failed to start runner:", error);
    process.exit(1);
  }
};

const shutdown = async (signal: string) => {
  console.log(`Received ${signal}, shutting down gracefully...`);

  try {
    await runner.stop();
    process.exit(0);
  } catch (error) {
    console.error("Error during shutdown:", error);
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

start();
