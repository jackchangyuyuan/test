ALTER TABLE "server" ADD COLUMN "invite_code" text NOT NULL;--> statement-breakpoint
ALTER TABLE "server" ADD CONSTRAINT "server_invite_code_unique" UNIQUE("invite_code");