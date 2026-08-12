import { and, eq } from "drizzle-orm";

import { db } from "./client.ts";
import { serverMember } from "./schema/index.ts";

export async function getMembership(serverId: string, userId: string) {
  const [membership] = await db
    .select()
    .from(serverMember)
    .where(
      and(eq(serverMember.serverId, serverId), eq(serverMember.userId, userId)),
    );

  return membership ?? null;
}
