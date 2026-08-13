import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { app } from "../app.ts";
import { db } from "../db/client.ts";
import { serverMember, user } from "../db/schema/index.ts";
import type { ServerResponse } from "../test-support.ts";
import { createAuthTestHelpers } from "../test-support.ts";

const { signUpAndGetCookie, createServer, cleanup } = createAuthTestHelpers();

afterAll(cleanup);

describe("POST /api/servers", () => {
  it("rejects a request with no session", async () => {
    const res = await request(app)
      .post("/api/servers")
      .send({ name: "My Server" });

    expect(res.status).toBe(401);
  });

  it("creates a server and makes the creator its owner", async () => {
    const { cookie } = await signUpAndGetCookie("create");

    const res = await request(app)
      .post("/api/servers")
      .set("Cookie", cookie)
      .send({ name: "My Server" });

    expect(res.status).toBe(201);

    const created = (res.body as { server: ServerResponse }).server;
    expect(created.name).toBe("My Server");
    expect(created.inviteCode).toEqual(expect.any(String));

    const members = await db
      .select()
      .from(serverMember)
      .where(eq(serverMember.serverId, created.id));

    expect(members).toHaveLength(1);
    expect(members[0]?.role).toBe("owner");
    expect(members[0]?.userId).toBe(created.ownerId);
  });

  it("rejects an empty server name", async () => {
    const { cookie } = await signUpAndGetCookie("validation");

    const res = await request(app)
      .post("/api/servers")
      .set("Cookie", cookie)
      .send({ name: "" });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/servers", () => {
  it("rejects a request with no session", async () => {
    const res = await request(app).get("/api/servers");

    expect(res.status).toBe(401);
  });

  it("only returns servers the current user is a member of", async () => {
    const memberA = await signUpAndGetCookie("list-a");
    const memberB = await signUpAndGetCookie("list-b");

    const createRes = await request(app)
      .post("/api/servers")
      .set("Cookie", memberA.cookie)
      .send({ name: "A's Server" });

    const created = (createRes.body as { server: ServerResponse }).server;

    const resA = await request(app)
      .get("/api/servers")
      .set("Cookie", memberA.cookie);
    const resB = await request(app)
      .get("/api/servers")
      .set("Cookie", memberB.cookie);

    const serversA = (resA.body as { servers: ServerResponse[] }).servers;
    const serversB = (resB.body as { servers: ServerResponse[] }).servers;

    expect(serversA.some((s) => s.id === created.id)).toBe(true);
    expect(serversB.some((s) => s.id === created.id)).toBe(false);
  });
});

describe("POST /api/servers/join", () => {
  it("rejects a request with no session", async () => {
    const res = await request(app)
      .post("/api/servers/join")
      .send({ inviteCode: "whatever" });

    expect(res.status).toBe(401);
  });

  it("rejects an invalid invite code", async () => {
    const { cookie } = await signUpAndGetCookie("join-invalid");

    const res = await request(app)
      .post("/api/servers/join")
      .set("Cookie", cookie)
      .send({ inviteCode: "does-not-exist" });

    expect(res.status).toBe(404);
  });

  it("lets a user join a server via its invite code", async () => {
    const owner = await signUpAndGetCookie("join-owner");
    const joiner = await signUpAndGetCookie("join-joiner");
    const created = await createServer(owner.cookie, "Joinable Server");

    const res = await request(app)
      .post("/api/servers/join")
      .set("Cookie", joiner.cookie)
      .send({ inviteCode: created.inviteCode });

    expect(res.status).toBe(200);

    const [joinerUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, joiner.email));

    if (!joinerUser) {
      throw new Error("Expected joiner user to exist");
    }

    const membership = await db
      .select()
      .from(serverMember)
      .where(eq(serverMember.userId, joinerUser.id));

    expect(membership).toHaveLength(1);
    expect(membership[0]?.role).toBe("member");
  });

  it("rejects joining a server the user is already a member of", async () => {
    const owner = await signUpAndGetCookie("join-twice-owner");
    const created = await createServer(owner.cookie, "No Double Join Server");

    const res = await request(app)
      .post("/api/servers/join")
      .set("Cookie", owner.cookie)
      .send({ inviteCode: created.inviteCode });

    expect(res.status).toBe(409);
  });
});
