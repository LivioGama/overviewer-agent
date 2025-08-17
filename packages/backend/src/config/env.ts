```ts
import { validateEnv } from "@ollama-turbo-agent/shared";
import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Helper schemas                                                             */
/* -------------------------------------------------------------------------- */

const requiredString = (min: number = 1) => z.string().min(min);
const optionalString = (min: number = 0) => z.string().min(min).optional();

/* -------------------------------------------------------------------------- */
/* Environment schema                                                         */
/* -------------------------------------------------------------------------- */

export const envSchema = z
  .object({
    // General
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3001),

    // GitHub integration
    GITHUB_APP_ID: requiredString(),
    GITHUB_APP_PRIVATE_KEY: requiredString(),
    GITHUB_WEBHOOK_SECRET: requiredString(),
    GITHUB_CLIENT_ID: requiredString(),
    GITHUB_CLIENT_SECRET: requiredString(),

    // Persistence
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),

    // Ollama service
    OLLAMA_API_URL: z.string().url().default("https://ollama.com"),
    OLLAMA_API_KEY: optionalString(),

    // AWS credentials
    AWS_REGION: z.string().default("us-east-1"),
    AWS_ACCESS_KEY_ID: optionalString(),
    AWS_SECRET_ACCESS_KEY: optionalString(),

    // Logging
    LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),

    // Rate limiting
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
    RATE_LIMIT_WINDOW: z.string().default("1 minute"),
  })
  .strict();

/* -------------------------------------------------------------------------- */
/* Exported values                                                             */
/* -------------------------------------------------------------------------- */

export const env = validateEnv(envSchema);
export type Env = z.infer<typeof envSchema>;
```