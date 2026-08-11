import { afterAll, describe, expect, it } from "vitest";

import { createAuthTestHelpers, signIn, signUp } from "./test-support.ts";

interface AuthSuccessBody {
  user: { email: string };
  token: string;
}

interface AuthErrorBody {
  code: string;
}

const { uniqueEmail, cleanup } = createAuthTestHelpers();

afterAll(cleanup);

describe("POST /api/auth/sign-up/email", () => {
  it("creates a new user", async () => {
    const email = uniqueEmail("sign-up");

    const res = await signUp(email, "password1234");

    const body = res.body as AuthSuccessBody;
    expect(res.status).toBe(200);
    expect(body.user.email).toBe(email);
    expect(body.token).toEqual(expect.any(String));
  });

  it("rejects an email that is already registered", async () => {
    const email = uniqueEmail("duplicate");
    await signUp(email, "password1234");

    const res = await signUp(email, "password1234");

    const body = res.body as AuthErrorBody;
    expect(res.status).toBe(422);
    expect(body.code).toBe("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL");
  });

  it("rejects a password that is too short", async () => {
    const res = await signUp(uniqueEmail("short-password"), "short");

    const body = res.body as AuthErrorBody;
    expect(res.status).toBe(400);
    expect(body.code).toBe("PASSWORD_TOO_SHORT");
  });
});

describe("POST /api/auth/sign-in/email", () => {
  it("signs in an existing user and returns a session cookie", async () => {
    const email = uniqueEmail("sign-in");
    await signUp(email, "password1234");

    const res = await signIn(email, "password1234");

    expect(res.status).toBe(200);
    expect(res.get("Set-Cookie")?.[0]).toContain("better-auth.session_token=");
  });

  it("rejects an incorrect password", async () => {
    const email = uniqueEmail("wrong-password");
    await signUp(email, "password1234");

    const res = await signIn(email, "wrongpassword");

    const body = res.body as AuthErrorBody;
    expect(res.status).toBe(401);
    expect(body.code).toBe("INVALID_EMAIL_OR_PASSWORD");
  });
});
