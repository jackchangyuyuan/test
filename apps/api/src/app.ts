import express from "express";

import { errorHandler } from "./error-handler.ts";

export const app = express();

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(errorHandler);
