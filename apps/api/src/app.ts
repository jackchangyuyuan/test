import { toNodeHandler } from "better-auth/node";
import express from "express";

import { auth } from "./auth.ts";
import { errorHandler } from "./error-handler.ts";
import { getSession, requireAuth } from "./require-auth.ts";
import { serversRouter } from "./routes/servers.ts";

export const app = express();

app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json({ user: getSession(req).user });
});

app.use("/api/servers", serversRouter);

app.use(errorHandler);
