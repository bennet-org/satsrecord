CREATE TABLE "organisation_settings" (
	"organisation_id" uuid PRIMARY KEY NOT NULL,
	"registration_number" text,
	"country" text,
	"reporting_currency" text,
	"sender_name" text,
	"reply_to" text,
	"allowed_origins" text[],
	"wallet_draft_enc" text,
	"wallet_revision" uuid,
	"wallet_confirmed" boolean DEFAULT false NOT NULL,
	"fresh_check_overridden" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "organisation_settings" ADD CONSTRAINT "organisation_settings_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;