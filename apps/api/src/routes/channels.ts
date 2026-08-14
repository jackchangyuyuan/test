import { and, eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";

import { db } from "../db/client.ts";
import { getMembership } from "../db/membership.ts";
import { channel } from "../db/schema/index.ts";
import { getSession } from "../require-auth.ts";
import { messagesRouter } from "./messages.ts";

export const channelsRouter = Router({ mergeParams: true });

const createChannelSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

interface ServerParams {
  serverId: string;
  [key: string]: string;
}

interface ChannelParams extends ServerParams {
  channelId: string;
}

channelsRouter.use("/:channelId/messages", messagesRouter);

channelsRouter.post<ServerParams>("/", async (req, res) => {
  const { serverId } = req.params;
  const userId = getSession(req).user.id;

  const membership = await getMembership(serverId, userId);
  if (!membership) {
    res.status(403).json({ message: "Not a member of this server" });
    return;
  }

  const parsed = createChannelSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ message: "Invalid request body", issues: parsed.error.issues });
    return;
  }

  const [created] = await db
    .insert(channel)
    .values({ serverId, name: parsed.data.name })
    .returning();

  if (!created) {
    throw new Error("Insert into channel did not return a row");
  }

  res.status(201).json({ channel: created });
});

channelsRouter.get<ServerParams>("/", async (req, res) => {
  const { serverId } = req.params;
  const userId = getSession(req).user.id;

  const membership = await getMembership(serverId, userId);
  if (!membership) {
    res.status(403).json({ message: "Not a member of this server" });
    return;
  }

  const channels = await db
    .select()
    .from(channel)
    .where(eq(channel.serverId, serverId));

  res.json({ channels });
});

channelsRouter.delete<ChannelParams>("/:channelId", async (req, res) => {
  const { serverId, channelId } = req.params;
  const userId = getSession(req).user.id;

  const membership = await getMembership(serverId, userId);
  if (membership?.role !== "owner") {
    res
      .status(403)
      .json({ message: "Only the server owner can delete channels" });
    return;
  }

  await db
    .delete(channel)
    .where(and(eq(channel.id, channelId), eq(channel.serverId, serverId)));

  res.status(204).send();
});
