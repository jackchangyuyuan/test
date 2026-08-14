import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { app } from "../app.ts";
import { db } from "../db/client.ts";
import { message, user } from "../db/schema/index.ts";
import type { MessageResponse } from "../test-support.ts";
import { createAuthTestHelpers } from "../test-support.ts";

const {
  signUpAndGetCookie,
  createServer: createTestServer,
  createChannel,
  createMessage,
  cleanup,
} = createAuthTestHelpers();

afterAll(cleanup);

function messagesPath(serverId: string, channelId: string) {
  return `/api/servers/${serverId}/channels/${channelId}/messages`;
}

describe("POST /api/servers/:serverId/channels/:channelId/messages", () => {
  it("rejects a request with no session", async () => {
    const owner = await signUpAndGetCookie("post-owner");
    const created = await createTestServer(owner.cookie, "Post Server");
    const channel = await createChannel(owner.cookie, created.id, "general");

    const res = await request(app)
      .post(messagesPath(created.id, channel.id))
      .send({ content: "hello" });

    expect(res.status).toBe(401);
  });

  it("rejects a non-member", async () => {
    const owner = await signUpAndGetCookie("post-owner-2");
    const outsider = await signUpAndGetCookie("post-outsider");
    const created = await createTestServer(owner.cookie, "Members Only Server");
    const channel = await createChannel(owner.cookie, created.id, "general");

    const res = await request(app)
      .post(messagesPath(created.id, channel.id))
      .set("Cookie", outsider.cookie)
      .send({ content: "hello" });

    expect(res.status).toBe(403);
  });

  it("rejects a channel that does not belong to the given server", async () => {
    const owner = await signUpAndGetCookie("post-owner-3");
    const serverA = await createTestServer(owner.cookie, "Server A");
    const serverB = await createTestServer(owner.cookie, "Server B");
    const channelInA = await createChannel(owner.cookie, serverA.id, "general");

    const res = await request(app)
      .post(messagesPath(serverB.id, channelInA.id))
      .set("Cookie", owner.cookie)
      .send({ content: "hello" });

    expect(res.status).toBe(404);
  });

  it("lets a member post a message", async () => {
    const owner = await signUpAndGetCookie("post-owner-4");
    const created = await createTestServer(owner.cookie, "Message Server");
    const channel = await createChannel(owner.cookie, created.id, "general");

    const res = await request(app)
      .post(messagesPath(created.id, channel.id))
      .set("Cookie", owner.cookie)
      .send({ content: "hello world" });

    expect(res.status).toBe(201);
    const createdMessage = (res.body as { message: MessageResponse }).message;
    expect(createdMessage.content).toBe("hello world");
    expect(createdMessage.channelId).toBe(channel.id);
  });

  it("rejects an empty message", async () => {
    const owner = await signUpAndGetCookie("post-owner-5");
    const created = await createTestServer(owner.cookie, "Validation Server");
    const channel = await createChannel(owner.cookie, created.id, "general");

    const res = await request(app)
      .post(messagesPath(created.id, channel.id))
      .set("Cookie", owner.cookie)
      .send({ content: "" });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/servers/:serverId/channels/:channelId/messages", () => {
  it("rejects a non-member", async () => {
    const owner = await signUpAndGetCookie("get-owner");
    const outsider = await signUpAndGetCookie("get-outsider");
    const created = await createTestServer(owner.cookie, "List Server");
    const channel = await createChannel(owner.cookie, created.id, "general");

    const res = await request(app)
      .get(messagesPath(created.id, channel.id))
      .set("Cookie", outsider.cookie);

    expect(res.status).toBe(403);
  });

  it("returns messages newest first and supports the 'before' cursor", async () => {
    const owner = await signUpAndGetCookie("get-owner-2");
    const created = await createTestServer(owner.cookie, "History Server");
    const channel = await createChannel(owner.cookie, created.id, "general");

    const firstMessage = await createMessage(
      owner.cookie,
      created.id,
      channel.id,
      "first",
    );
    const secondMessage = await createMessage(
      owner.cookie,
      created.id,
      channel.id,
      "second",
    );
    const thirdMessage = await createMessage(
      owner.cookie,
      created.id,
      channel.id,
      "third",
    );

    const res = await request(app)
      .get(messagesPath(created.id, channel.id))
      .set("Cookie", owner.cookie);

    expect(res.status).toBe(200);
    const messages = (res.body as { messages: MessageResponse[] }).messages;
    expect(messages.map((m) => m.content)).toEqual([
      "third",
      "second",
      "first",
    ]);

    const pageRes = await request(app)
      .get(messagesPath(created.id, channel.id))
      .query({ before: thirdMessage.id })
      .set("Cookie", owner.cookie);

    const page = (pageRes.body as { messages: MessageResponse[] }).messages;
    expect(page.map((m) => m.content)).toEqual(["second", "first"]);
    expect(page.some((m) => m.id === firstMessage.id)).toBe(true);
    expect(page.some((m) => m.id === secondMessage.id)).toBe(true);
  });

  it("rejects a 'before' cursor that belongs to a different channel", async () => {
    const owner = await signUpAndGetCookie("cross-channel-owner");
    const created = await createTestServer(
      owner.cookie,
      "Cross Channel Server",
    );
    const channelA = await createChannel(owner.cookie, created.id, "general");
    const channelB = await createChannel(owner.cookie, created.id, "random");

    const messageInB = await createMessage(
      owner.cookie,
      created.id,
      channelB.id,
      "from channel b",
    );

    const res = await request(app)
      .get(messagesPath(created.id, channelA.id))
      .query({ before: messageInB.id })
      .set("Cookie", owner.cookie);

    expect(res.status).toBe(400);
  });

  it("orders tied timestamps deterministically and does not skip a row across a page boundary", async () => {
    const owner = await signUpAndGetCookie("tie-owner");
    const created = await createTestServer(owner.cookie, "Tie Server");
    const channel = await createChannel(owner.cookie, created.id, "general");

    const [ownerUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, owner.email));

    if (!ownerUser) {
      throw new Error("Expected owner user to exist");
    }

    const tiedAt = new Date("2024-01-01T00:00:00.000Z");
    const inserted = await db
      .insert(message)
      .values([
        {
          channelId: channel.id,
          authorId: ownerUser.id,
          content: "tied-a",
          createdAt: tiedAt,
        },
        {
          channelId: channel.id,
          authorId: ownerUser.id,
          content: "tied-b",
          createdAt: tiedAt,
        },
      ])
      .returning();

    const [first, second] = [...inserted].sort((a, b) =>
      a.id > b.id ? -1 : 1,
    );

    if (!first || !second) {
      throw new Error("Expected two tied messages to be inserted");
    }

    const res = await request(app)
      .get(messagesPath(created.id, channel.id))
      .set("Cookie", owner.cookie);

    const messages = (res.body as { messages: MessageResponse[] }).messages;
    expect(messages.map((m) => m.id)).toEqual([first.id, second.id]);

    const pageRes = await request(app)
      .get(messagesPath(created.id, channel.id))
      .query({ before: first.id })
      .set("Cookie", owner.cookie);

    const page = (pageRes.body as { messages: MessageResponse[] }).messages;
    expect(page.map((m) => m.id)).toEqual([second.id]);
  });
});
