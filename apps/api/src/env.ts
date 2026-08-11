import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import { z } from "zod";

const dirname = path.dirname(fileURLToPath(import.meta.url));

config({ path: path.resolve(dirname, "../../../.env") });

const envSchema = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(3000),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
});

export const env = envSchema.parse(process.env);
