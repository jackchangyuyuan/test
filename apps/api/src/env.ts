import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import { z } from "zod";

const dirname = path.dirname(fileURLToPath(import.meta.url));

config({ path: path.resolve(dirname, "../../../.env") });

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
});

export const env = envSchema.parse(process.env);
