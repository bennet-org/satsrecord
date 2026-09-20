CREATE INDEX "acknowledgements_settlement" ON "acknowledgements" USING btree ("settlement_id","sent_at");--> statement-breakpoint
CREATE INDEX "acknowledgements_donor" ON "acknowledgements" USING btree ("donor_id");--> statement-breakpoint
CREATE INDEX "amendments_supersedes" ON "amendments" USING btree ("organisation_id","supersedes_id");--> statement-breakpoint
CREATE INDEX "consents_donor" ON "consents" USING btree ("donor_id");--> statement-breakpoint
CREATE INDEX "descriptors_organisation" ON "descriptors" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "email_log_donor" ON "email_log" USING btree ("donor_id");--> statement-breakpoint
CREATE INDEX "organisation_invites_email" ON "organisation_invites" USING btree ("email");--> statement-breakpoint
CREATE INDEX "settlements_organisation" ON "settlements" USING btree ("organisation_id","first_seen_at");--> statement-breakpoint
CREATE INDEX "settlements_address" ON "settlements" USING btree ("address_id");--> statement-breakpoint
CREATE INDEX "submissions_address" ON "submissions" USING btree ("address_id");--> statement-breakpoint
CREATE INDEX "submissions_organisation" ON "submissions" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "submissions_donor" ON "submissions" USING btree ("donor_id");--> statement-breakpoint
CREATE INDEX "valuations_settlement" ON "valuations" USING btree ("settlement_id","created_at");--> statement-breakpoint
CREATE INDEX "widget_rate_limits_window" ON "widget_rate_limits" USING btree ("window_start");