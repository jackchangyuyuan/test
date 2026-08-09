import type { NextFunction, Request, Response } from "express";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  console.error(err);

  if (res.headersSent) {
    next(err);
    return;
  }

  res.status(500).json({ message: "Internal Server Error" });
}
