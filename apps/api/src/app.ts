import { toNodeHandler } from "better-auth/node";
import express from "express";

import { auth } from "./auth.ts";
import { errorHandler } from "./error-handler.ts";

export const app = express();

app.all("/api/auth/*splat", toNodeHandler(auth));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(errorHandler);
