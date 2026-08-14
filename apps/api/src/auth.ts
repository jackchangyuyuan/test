import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { db } from "./db/client.ts";
import * as schema from "./db/schema/index.ts";
import { env } from "./env.ts";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  // The Vite dev server proxies /api same-origin, but it doesn't rewrite the
  // browser's Origin header, so Better Auth still sees the Vite dev origin
  // and needs to trust it explicitly.
  trustedOrigins: ["http://localhost:5173"],
  emailAndPassword: {
    enabled: true,
  },
});
