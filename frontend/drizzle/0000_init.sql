CREATE TABLE "experts" (
	"wallet_address" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"perito_ref" text,
	"role" text DEFAULT 'expert' NOT NULL,
	"api_key_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sealed_bundles" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"bundle" jsonb NOT NULL,
	"bundle_hash" text NOT NULL,
	"verdict" text NOT NULL,
	"expert_address" text NOT NULL,
	"sealed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attest_tx_hash" text,
	"attest_commitment" text,
	"attested_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "sealed_bundles_bundle_hash_idx" ON "sealed_bundles" USING btree ("bundle_hash");--> statement-breakpoint
CREATE INDEX "sealed_bundles_verdict_idx" ON "sealed_bundles" USING btree ("verdict");--> statement-breakpoint
CREATE INDEX "sealed_bundles_expert_idx" ON "sealed_bundles" USING btree ("expert_address");--> statement-breakpoint
CREATE INDEX "sealed_bundles_sealed_at_idx" ON "sealed_bundles" USING btree ("sealed_at");