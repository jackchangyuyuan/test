import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { app } from "./app.ts";
import { createAuthTestHelpers } from "./test-support.ts";

describe("GET /health", () => {
  it("returns ok status", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("GET /api/me", () => {
  const { signUpAndGetCookie, cleanup } = createAuthTestHelpers();

  afterAll(cleanup);

  it("rejects a request with no session", async () => {
    const res = await request(app).get("/api/me");

    expect(res.status).toBe(401);
  });

  it("returns the current user for an authenticated session", async () => {
    const { email, cookie } = await signUpAndGetCookie("me");

    const res = await request(app).get("/api/me").set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect((res.body as { user: { email: string } }).user.email).toBe(email);
  });
});
