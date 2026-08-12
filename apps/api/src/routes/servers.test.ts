import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { app } from "../app.ts";
import { db } from "../db/client.ts";
import { serverMember } from "../db/schema/index.ts";
import type { ServerResponse } from "../test-support.ts";
import { createAuthTestHelpers } from "../test-support.ts";

const { signUpAndGetCookie, cleanup } = createAuthTestHelpers();

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
