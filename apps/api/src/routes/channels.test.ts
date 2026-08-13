import { eq, inArray } from "drizzle-orm";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { app } from "../app.ts";
import { db } from "../db/client.ts";
import { channel, serverMember, user } from "../db/schema/index.ts";
import type { ChannelResponse } from "../test-support.ts";
import { createAuthTestHelpers } from "../test-support.ts";

const { signUpAndGetCookie, createServer, createChannel, cleanup } =
  createAuthTestHelpers();

afterAll(cleanup);

describe("POST /api/servers/:serverId/channels", () => {
  it("rejects a request with no session", async () => {
    const owner = await signUpAndGetCookie("post-owner");
    const created = await createServer(owner.cookie, "Post Server");

    const res = await request(app)
      .post(`/api/servers/${created.id}/channels`)
      .send({ name: "general" });

    expect(res.status).toBe(401);
  });

  it("rejects a non-member", async () => {
    const owner = await signUpAndGetCookie("post-owner-2");
    const outsider = await signUpAndGetCookie("post-outsider");
    const created = await createServer(owner.cookie, "Members Only Server");

    const res = await request(app)
      .post(`/api/servers/${created.id}/channels`)
      .set("Cookie", outsider.cookie)
      .send({ name: "general" });

    expect(res.status).toBe(403);
  });

  it("lets a member create a channel", async () => {
    const owner = await signUpAndGetCookie("post-owner-3");
    const created = await createServer(owner.cookie, "Channel Server");

    const res = await request(app)
      .post(`/api/servers/${created.id}/channels`)
      .set("Cookie", owner.cookie)
      .send({ name: "general" });

    expect(res.status).toBe(201);
    const channelBody = (res.body as { channel: ChannelResponse }).channel;
    expect(channelBody.name).toBe("general");
    expect(channelBody.serverId).toBe(created.id);
  });
});

describe("GET /api/servers/:serverId/channels", () => {
  it("rejects a non-member", async () => {
    const owner = await signUpAndGetCookie("get-owner");
    const outsider = await signUpAndGetCookie("get-outsider");
    const created = await createServer(owner.cookie, "List Server");

    const res = await request(app)
      .get(`/api/servers/${created.id}/channels`)
      .set("Cookie", outsider.cookie);

    expect(res.status).toBe(403);
  });

  it("lists channels for a member", async () => {
    const owner = await signUpAndGetCookie("get-owner-2");
    const created = await createServer(owner.cookie, "List Server 2");

    await createChannel(owner.cookie, created.id, "general");

    const res = await request(app)
      .get(`/api/servers/${created.id}/channels`)
      .set("Cookie", owner.cookie);

    expect(res.status).toBe(200);
    const channels = (res.body as { channels: ChannelResponse[] }).channels;
    expect(channels.some((c) => c.name === "general")).toBe(true);
  });
});

describe("DELETE /api/servers/:serverId/channels/:channelId", () => {
  it("rejects a member who is not the owner", async () => {
    const owner = await signUpAndGetCookie("delete-owner");
    const member = await signUpAndGetCookie("delete-member");
    const created = await createServer(owner.cookie, "Delete Server");

    const [memberUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, member.email));

    if (!memberUser) {
      throw new Error("Expected member user to exist");
    }

    await db.insert(serverMember).values({
      serverId: created.id,
      userId: memberUser.id,
      role: "member",
    });

    const createdChannel = await createChannel(
      owner.cookie,
      created.id,
      "general",
    );

    const res = await request(app)
      .delete(`/api/servers/${created.id}/channels/${createdChannel.id}`)
      .set("Cookie", member.cookie);

    expect(res.status).toBe(403);
  });

  it("lets the owner delete a channel", async () => {
    const owner = await signUpAndGetCookie("delete-owner-2");
    const created = await createServer(owner.cookie, "Delete Server 2");

    const createdChannel = await createChannel(
      owner.cookie,
      created.id,
      "general",
    );

    const res = await request(app)
      .delete(`/api/servers/${created.id}/channels/${createdChannel.id}`)
      .set("Cookie", owner.cookie);

    expect(res.status).toBe(204);

    const remaining = await db
      .select()
      .from(channel)
      .where(inArray(channel.id, [createdChannel.id]));
    expect(remaining).toHaveLength(0);
  });
});
