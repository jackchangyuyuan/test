import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { errorHandler } from "./error-handler.ts";

function createMockResponse(headersSent: boolean) {
  return {
    headersSent,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe("errorHandler", () => {
  it("responds with a generic JSON 500 and logs the error", () => {
    const res = createMockResponse(false);
    const next = vi.fn();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    errorHandler(
      new Error("boom"),
      {} as never,
      res as unknown as Response,
      next,
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Internal Server Error",
    });
    expect(next).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(new Error("boom"));

    consoleError.mockRestore();
  });

  it("does not leak the underlying error message in the response body", () => {
    const res = createMockResponse(false);
    const next = vi.fn();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    errorHandler(
      new Error("connection string contains a password"),
      {} as never,
      res as unknown as Response,
      next,
    );

    expect(res.json).toHaveBeenCalledExactlyOnceWith({
      message: "Internal Server Error",
    });

    consoleError.mockRestore();
  });

  it("delegates to Express's default handler once headers are already sent", () => {
    const res = createMockResponse(true);
    const next = vi.fn();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const err = new Error("boom");

    errorHandler(err, {} as never, res as unknown as Response, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(err);

    consoleError.mockRestore();
  });
});
