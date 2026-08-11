import { inArray } from "drizzle-orm";
import request from "supertest";

import { app } from "./app.ts";
import { db } from "./db/client.ts";
import { user } from "./db/schema.ts";

const origin = { Origin: "http://localhost:3000" };

export async function signUp(email: string, password: string) {
  return request(app)
    .post("/api/auth/sign-up/email")
    .set(origin)
    .send({ email, password, name: "Test User" });
}

export async function signIn(email: string, password: string) {
  return request(app)
    .post("/api/auth/sign-in/email")
    .set(origin)
    .send({ email, password });
}

export function createAuthTestHelpers() {
  const createdEmails: string[] = [];

  function uniqueEmail(label: string) {
    const email = `${label}-${crypto.randomUUID()}@test.opencord.local`;
    createdEmails.push(email);
    return email;
  }

  async function signUpAndGetCookie(label: string) {
    const email = uniqueEmail(label);
    const res = await signUp(email, "password1234");
    const cookie = res.get("Set-Cookie")?.[0];

    if (typeof cookie !== "string") {
      throw new Error("Expected a set-cookie header on sign-up response");
    }

    return { email, cookie };
  }

  async function cleanup() {
    if (createdEmails.length > 0) {
      await db.delete(user).where(inArray(user.email, createdEmails));
    }
  }

  return { uniqueEmail, signUpAndGetCookie, cleanup };
}
