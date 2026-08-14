import { and, eq } from "drizzle-orm";

import { db } from "./client.ts";
import { channel, serverMember } from "./schema/index.ts";

export async function getMembership(serverId: string, userId: string) {
  const [membership] = await db
    .select()
    .from(serverMember)
    .where(
      and(eq(serverMember.serverId, serverId), eq(serverMember.userId, userId)),
    );

  return membership ?? null;
}

export async function findChannelInServer(serverId: string, channelId: string) {
  const [found] = await db
    .select()
    .from(channel)
    .where(and(eq(channel.id, channelId), eq(channel.serverId, serverId)));

  return found ?? null;
}
