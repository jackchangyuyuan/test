import type { SQL } from "drizzle-orm";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";

import { db } from "../db/client.ts";
import { findChannelInServer, getMembership } from "../db/membership.ts";
import { message } from "../db/schema/index.ts";
import { getSession } from "../require-auth.ts";

export const messagesRouter = Router({ mergeParams: true });

const createMessageSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

const listMessagesQuerySchema = z.object({
  before: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

interface MessageParams {
  serverId: string;
  channelId: string;
  [key: string]: string;
}

messagesRouter.post<MessageParams>("/", async (req, res) => {
  const { serverId, channelId } = req.params;
  const userId = getSession(req).user.id;

  const membership = await getMembership(serverId, userId);
  if (!membership) {
    res.status(403).json({ message: "Not a member of this server" });
    return;
  }

  const foundChannel = await findChannelInServer(serverId, channelId);
  if (!foundChannel) {
    res.status(404).json({ message: "Channel not found" });
    return;
  }

  const parsed = createMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ message: "Invalid request body", issues: parsed.error.issues });
    return;
  }

  const [created] = await db
    .insert(message)
    .values({ channelId, authorId: userId, content: parsed.data.content })
    .returning();

  if (!created) {
    throw new Error("Insert into message did not return a row");
  }

  res.status(201).json({ message: created });
});

messagesRouter.get<MessageParams>("/", async (req, res) => {
  const { serverId, channelId } = req.params;
  const userId = getSession(req).user.id;

  const membership = await getMembership(serverId, userId);
  if (!membership) {
    res.status(403).json({ message: "Not a member of this server" });
    return;
  }

  const foundChannel = await findChannelInServer(serverId, channelId);
  if (!foundChannel) {
    res.status(404).json({ message: "Channel not found" });
    return;
  }

  const parsedQuery = listMessagesQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    res
      .status(400)
      .json({ message: "Invalid query", issues: parsedQuery.error.issues });
    return;
  }

  let cursorCondition: SQL | undefined;

  if (parsedQuery.data.before) {
    const [cursor] = await db
      .select({ createdAt: message.createdAt, id: message.id })
      .from(message)
      .where(
        and(
          eq(message.id, parsedQuery.data.before),
          eq(message.channelId, channelId),
        ),
      );

    if (!cursor) {
      res.status(400).json({ message: "Invalid 'before' cursor" });
      return;
    }

    // Rows that come after the cursor in (createdAt DESC, id DESC) order:
    // strictly older, or tied on createdAt and lower id.
    cursorCondition = or(
      lt(message.createdAt, cursor.createdAt),
      and(eq(message.createdAt, cursor.createdAt), lt(message.id, cursor.id)),
    );
  }

  const messages = await db
    .select()
    .from(message)
    .where(and(eq(message.channelId, channelId), cursorCondition))
    .orderBy(desc(message.createdAt), desc(message.id))
    .limit(parsedQuery.data.limit);

  res.json({ messages });
});
