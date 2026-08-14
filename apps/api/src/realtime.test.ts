import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import type { Socket as ClientSocket } from "socket.io-client";
import { io as ioClient } from "socket.io-client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { app } from "./app.ts";
import { createRealtimeServer } from "./realtime.ts";
import type { MessageResponse } from "./test-support.ts";
import { createAuthTestHelpers } from "./test-support.ts";

const {
  signUpAndGetCookie,
  createServer: createTestServer,
  createChannel,
  createMessage,
  cleanup,
} = createAuthTestHelpers();

afterAll(cleanup);

describe("realtime message delivery", () => {
  let httpServer: ReturnType<typeof createServer>;
  let baseUrl: string;
  const clients: ClientSocket[] = [];

  beforeAll(async () => {
    httpServer = createServer(app);
    createRealtimeServer(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, resolve);
    });

    const { port } = httpServer.address() as AddressInfo;
    baseUrl = `http://localhost:${String(port)}`;
  });

  afterAll(() => {
    httpServer.close();
  });

  afterEach(() => {
    for (const client of clients) {
      client.disconnect();
    }
    clients.length = 0;
  });

  function connect(cookie: string) {
    const socket = ioClient(baseUrl, {
      extraHeaders: cookie ? { Cookie: cookie } : {},
      reconnection: false,
    });
    clients.push(socket);
    return socket;
  }

  function waitForConnect(socket: ClientSocket) {
    return new Promise<void>((resolve, reject) => {
      socket.once("connect", () => {
        resolve();
      });
      socket.once("connect_error", (err: Error) => {
        reject(err);
      });
    });
  }

  it("rejects a connection without a valid session", async () => {
    const socket = connect("");

    await expect(waitForConnect(socket)).rejects.toThrow();
  });

  it("delivers a newly posted message only to clients subscribed to its channel", async () => {
    const owner = await signUpAndGetCookie("realtime-owner");
    const created = await createTestServer(owner.cookie, "Realtime Server");
    const channelA = await createChannel(owner.cookie, created.id, "general");
    await createChannel(owner.cookie, created.id, "random");

    const subscribed = connect(owner.cookie);
    const unsubscribed = connect(owner.cookie);
    await Promise.all([
      waitForConnect(subscribed),
      waitForConnect(unsubscribed),
    ]);

    const joined = await new Promise<boolean>((resolve) => {
      subscribed.emit(
        "join-channel",
        { serverId: created.id, channelId: channelA.id },
        resolve,
      );
    });
    expect(joined).toBe(true);

    const received = new Promise<MessageResponse>((resolve) => {
      subscribed.once("message:new", resolve);
    });
    const receivedByUnsubscribed = new Promise<MessageResponse>((resolve) => {
      unsubscribed.once("message:new", resolve);
    });

    const posted = await createMessage(
      owner.cookie,
      created.id,
      channelA.id,
      "hello over the wire",
    );

    const message = await received;
    expect(message.id).toBe(posted.id);
    expect(message.content).toBe("hello over the wire");

    const raced = await Promise.race([
      receivedByUnsubscribed.then(() => "received" as const),
      new Promise<"timeout">((resolve) => {
        setTimeout(() => {
          resolve("timeout");
        }, 250);
      }),
    ]);
    expect(raced).toBe("timeout");
  });

  it("rejects joining a channel in a server the user is not a member of", async () => {
    const owner = await signUpAndGetCookie("realtime-join-owner");
    const outsider = await signUpAndGetCookie("realtime-join-outsider");
    const created = await createTestServer(
      owner.cookie,
      "Private Realtime Server",
    );
    const channel = await createChannel(owner.cookie, created.id, "general");

    const socket = connect(outsider.cookie);
    await waitForConnect(socket);

    const joined = await new Promise<boolean>((resolve) => {
      socket.emit(
        "join-channel",
        { serverId: created.id, channelId: channel.id },
        resolve,
      );
    });

    expect(joined).toBe(false);
  });
});
