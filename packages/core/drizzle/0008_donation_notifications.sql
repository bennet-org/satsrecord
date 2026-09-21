CREATE TABLE "donation_notifications" (
	"settlement_id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "organisation_settings" ADD COLUMN "notification_mode" text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "organisation_settings" ADD COLUMN "notification_email_enc" text;--> statement-breakpoint
ALTER TABLE "donation_notifications" ADD CONSTRAINT "donation_notifications_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donation_notifications" ADD CONSTRAINT "donation_notifications_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "donation_notifications_pending" ON "donation_notifications" USING btree ("organisation_id","status","created_at");