import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth.ts";

export const server = pgTable("server", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const serverMember = pgTable(
  "server_member",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    serverId: text("server_id")
      .notNull()
      .references(() => server.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "member"] })
      .notNull()
      .default("member"),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("server_member_server_id_user_id_idx").on(
      table.serverId,
      table.userId,
    ),
  ],
);

export const serverRelations = relations(server, ({ many, one }) => ({
  members: many(serverMember),
  owner: one(user, { fields: [server.ownerId], references: [user.id] }),
}));

export const serverMemberRelations = relations(serverMember, ({ one }) => ({
  server: one(server, {
    fields: [serverMember.serverId],
    references: [server.id],
  }),
  user: one(user, { fields: [serverMember.userId], references: [user.id] }),
}));
