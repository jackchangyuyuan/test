import { eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";

import { db } from "../db/client.ts";
import { getMembership } from "../db/membership.ts";
import { server, serverMember } from "../db/schema/index.ts";
import { getSession, requireAuth } from "../require-auth.ts";
import { channelsRouter } from "./channels.ts";

export const serversRouter = Router();

const createServerSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

const joinServerSchema = z.object({
  inviteCode: z.string().trim().min(1),
});

serversRouter.use(requireAuth);

serversRouter.use("/:serverId/channels", channelsRouter);

serversRouter.post("/", async (req, res) => {
  const parsed = createServerSchema.safeParse(req.body);

  if (!parsed.success) {
    res
      .status(400)
      .json({ message: "Invalid request body", issues: parsed.error.issues });
    return;
  }

  const userId = getSession(req).user.id;

  const created = await db.transaction(async (tx) => {
    const [newServer] = await tx
      .insert(server)
      .values({ name: parsed.data.name, ownerId: userId })
      .returning();

    if (!newServer) {
      throw new Error("Insert into server did not return a row");
    }

    await tx.insert(serverMember).values({
      serverId: newServer.id,
      userId,
      role: "owner",
    });

    return newServer;
  });

  res.status(201).json({ server: created });
});

serversRouter.get("/", async (req, res) => {
  const userId = getSession(req).user.id;

  const servers = await db
    .select({
      id: server.id,
      name: server.name,
      ownerId: server.ownerId,
      inviteCode: server.inviteCode,
      createdAt: server.createdAt,
    })
    .from(serverMember)
    .innerJoin(server, eq(serverMember.serverId, server.id))
    .where(eq(serverMember.userId, userId));

  res.json({ servers });
});

serversRouter.post("/join", async (req, res) => {
  const parsed = joinServerSchema.safeParse(req.body);

  if (!parsed.success) {
    res
      .status(400)
      .json({ message: "Invalid request body", issues: parsed.error.issues });
    return;
  }

  const userId = getSession(req).user.id;

  const [foundServer] = await db
    .select()
    .from(server)
    .where(eq(server.inviteCode, parsed.data.inviteCode));

  if (!foundServer) {
    res.status(404).json({ message: "Invalid invite code" });
    return;
  }

  const existingMembership = await getMembership(foundServer.id, userId);
  if (existingMembership) {
    res.status(409).json({ message: "Already a member of this server" });
    return;
  }

  await db
    .insert(serverMember)
    .values({ serverId: foundServer.id, userId, role: "member" });

  res.status(200).json({ server: foundServer });
});
