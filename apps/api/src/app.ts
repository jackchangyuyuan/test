import { toNodeHandler } from "better-auth/node";
import express from "express";

import { auth } from "./auth.ts";
import { errorHandler } from "./error-handler.ts";
import { requireAuth } from "./require-auth.ts";

export const app = express();

app.all("/api/auth/*splat", toNodeHandler(auth));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/me", requireAuth, (req, res) => {
  if (!req.session) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  res.json({ user: req.session.user });
});

app.use(errorHandler);
