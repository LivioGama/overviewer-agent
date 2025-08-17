```ts
import { z } from "zod";
import { validateEnv } from "./shared";

/**
 * Schema for all required and optional environment variables.
 * Zod's coercion helpers keep the definitions succinct.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"] as const).default("development"),

    // Convert string → number and validate.
    PORT: z.coerce.number().int().positive().default(3001),

    GITHUB_APP_ID: z.string().min(1),
    GITHUB_APP_PRIVATE_KEY: z.string().min(1),
    GITHUB_WEBHOOK_SECRET: z.string().min(1),
    GITHUB_CLIENT_ID: z.string().min(1),
    GITHUB_CLIENT_SECRET: z.string().min(1),

    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),

    OLLAMA_API_URL: z.string().url().default("https://ollama.com"),
    OLLAMA_API_KEY: z.string().optional(),

    AWS_REGION: z.string().default("us-east-1"),
    AWS_ACCESS_KEY_ID: z.string().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().optional(),

    LOG_LEVEL: z.enum(["error", "warn", "info", "debug"] as const).default("info"),

    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
    RATE_LIMIT_WINDOW: z.string().default("1 minute"),
  })
  .strict();

/** Typed representation of the validated environment. */
export type Env = z.infer<typeof envSchema>;

/**
 * Validate `process.env` against the schema.
 * On failure, augment the error message and re‑throw.
 */
export const env: Env = (() => {
  try {
    return validateEnv(envSchema);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`❌ Environment validation failed: ${message}`);
  }
})();
```