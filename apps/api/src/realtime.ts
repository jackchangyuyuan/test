import type { Server as HttpServer } from "node:http";

import { fromNodeHeaders } from "better-auth/node";
import type { DefaultEventsMap } from "socket.io";
import { Server } from "socket.io";

import { auth } from "./auth.ts";
import { findChannelInServer, getMembership } from "./db/membership.ts";
import type { message } from "./db/schema/index.ts";

type Message = typeof message.$inferSelect;

interface JoinChannelPayload {
  serverId: string;
  channelId: string;
}

interface ClientToServerEvents {
  "join-channel": (
    payload: JoinChannelPayload,
    ack: (ok: boolean) => void,
  ) => void;
  "leave-channel": (payload: { channelId: string }) => void;
}

interface ServerToClientEvents {
  "message:new": (message: Message) => void;
}

interface SocketData {
  userId: string;
}

type RealtimeServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>;

function channelRoom(channelId: string) {
  return `channel:${channelId}`;
}

let io: RealtimeServer | undefined;

export function createRealtimeServer(httpServer: HttpServer): RealtimeServer {
  const server: RealtimeServer = new Server(httpServer);
  io = server;

  server.use((socket, next) => {
    void auth.api
      .getSession({ headers: fromNodeHeaders(socket.handshake.headers) })
      .then((session) => {
        if (!session) {
          next(new Error("Unauthorized"));
          return;
        }

        socket.data.userId = session.user.id;
        next();
      });
  });

  server.on("connection", (socket) => {
    socket.on("join-channel", (payload, ack) => {
      void (async () => {
        const membership = await getMembership(
          payload.serverId,
          socket.data.userId,
        );
        const foundChannel =
          membership &&
          (await findChannelInServer(payload.serverId, payload.channelId));

        if (!foundChannel) {
          ack(false);
          return;
        }

        await socket.join(channelRoom(payload.channelId));
        ack(true);
      })();
    });

    socket.on("leave-channel", (payload) => {
      void socket.leave(channelRoom(payload.channelId));
    });
  });

  return server;
}

export function broadcastNewMessage(channelId: string, message: Message) {
  io?.to(channelRoom(channelId)).emit("message:new", message);
}
