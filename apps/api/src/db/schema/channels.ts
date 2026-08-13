import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { server } from "./servers.ts";

export const channel = pgTable(
  "channel",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    serverId: text("server_id")
      .notNull()
      .references(() => server.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("channel_server_id_idx").on(table.serverId)],
);

export const channelRelations = relations(channel, ({ one }) => ({
  server: one(server, { fields: [channel.serverId], references: [server.id] }),
}));
