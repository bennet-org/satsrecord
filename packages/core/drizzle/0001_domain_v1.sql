CREATE TABLE "acknowledgements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"settlement_id" uuid NOT NULL,
	"valuation_id" uuid NOT NULL,
	"donor_id" uuid,
	"attribution_at_send" text NOT NULL,
	"template_version" text NOT NULL,
	"provider_message_id" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"descriptor_id" uuid NOT NULL,
	"index" integer NOT NULL,
	"address" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "addresses_address_unique" UNIQUE("address")
);
--> statement-breakpoint
CREATE TABLE "amendments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"table_name" text NOT NULL,
	"supersedes_id" uuid NOT NULL,
	"replacement_id" uuid,
	"reason" text NOT NULL,
	"amended_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"donor_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"granted" boolean NOT NULL,
	"label_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "descriptors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"descriptor_enc" text NOT NULL,
	"script_type" text NOT NULL,
	"network" text NOT NULL,
	"label" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"next_index" integer DEFAULT 0 NOT NULL,
	"fresh_check_overridden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "donors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"name_enc" text,
	"email_enc" text,
	"email_index" text,
	"attribution" text NOT NULL,
	"verification_token_hash" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text,
	"donor_id" uuid,
	"template_version" text NOT NULL,
	"provider" text NOT NULL,
	"provider_message_id" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"address_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"txid" text,
	"vout" integer,
	"payment_hash" text,
	"amount_sats" bigint NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"block_time" timestamp with time zone,
	"block_height" integer,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"address_id" uuid NOT NULL,
	"donor_id" uuid,
	"session_token_hash" text NOT NULL,
	"origin" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "valuations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"settlement_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"rate" numeric(18, 6) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"source" text NOT NULL,
	"pair" text NOT NULL,
	"method" text NOT NULL,
	"rate_timestamp" timestamp with time zone NOT NULL,
	"confirmations_at_valuation" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "acknowledgements" ADD CONSTRAINT "acknowledgements_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acknowledgements" ADD CONSTRAINT "acknowledgements_valuation_id_valuations_id_fk" FOREIGN KEY ("valuation_id") REFERENCES "public"."valuations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acknowledgements" ADD CONSTRAINT "acknowledgements_donor_id_donors_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_descriptor_id_descriptors_id_fk" FOREIGN KEY ("descriptor_id") REFERENCES "public"."descriptors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_donor_id_donors_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_donor_id_donors_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_address_id_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_address_id_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_donor_id_donors_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valuations" ADD CONSTRAINT "valuations_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "addresses_descriptor_index" ON "addresses" USING btree ("descriptor_id","index");--> statement-breakpoint
CREATE UNIQUE INDEX "descriptors_one_active_per_org" ON "descriptors" USING btree ("organisation_id") WHERE "descriptors"."status" = 'active';--> statement-breakpoint
CREATE INDEX "donors_email_index" ON "donors" USING btree ("organisation_id","email_index");--> statement-breakpoint
CREATE UNIQUE INDEX "settlements_onchain_ref" ON "settlements" USING btree ("txid","vout");--> statement-breakpoint
CREATE UNIQUE INDEX "settlements_lightning_ref" ON "settlements" USING btree ("payment_hash");