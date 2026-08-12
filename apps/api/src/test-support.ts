import { inArray } from "drizzle-orm";
import request from "supertest";

import { app } from "./app.ts";
import { db } from "./db/client.ts";
import { server, user } from "./db/schema/index.ts";

const origin = { Origin: "http://localhost:3000" };

export interface ServerResponse {
  id: string;
  name: string;
  ownerId: string;
}

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
  const createdServerIds: string[] = [];

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

  async function createServer(cookie: string, name: string) {
    const res = await request(app)
      .post("/api/servers")
      .set("Cookie", cookie)
      .send({ name });

    const created = (res.body as { server: ServerResponse }).server;
    createdServerIds.push(created.id);
    return created;
  }

  async function cleanup() {
    if (createdServerIds.length > 0) {
      await db.delete(server).where(inArray(server.id, createdServerIds));
    }

    if (createdEmails.length > 0) {
      await db.delete(user).where(inArray(user.email, createdEmails));
    }
  }

  return { uniqueEmail, signUpAndGetCookie, createServer, cleanup };
}
