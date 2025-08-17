```ts
import { z } from "zod";
import { validateEnv } from "./shared";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"] as const).default("development"),

    // Convert string -> number, then validate
    PORT: z
      .preprocess((val) => Number(val), z.number().int().positive())
      .default(3001),

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

    RATE_LIMIT_MAX: z
      .preprocess((val) => Number(val), z.number().int().positive())
      .default(100),

    RATE_LIMIT_WINDOW: z.string().default("1 minute"),
  })
  .strict();

type Env = z.infer<typeof envSchema>;

let env: Env;

try {
  env = validateEnv(envSchema);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`Environment validation failed: ${message}`);
}

export { env };
export type { Env };
```