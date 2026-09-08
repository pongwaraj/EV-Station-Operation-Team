CREATE TABLE "import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_record_key" text NOT NULL,
	"content_hash" text NOT NULL,
	"event_timestamp" timestamp with time zone,
	"station_key" text,
	"entity_key" text,
	"source_row_number" integer,
	"sanitized_row" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_import_id_data_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."data_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "import_rows_source_record_key_idx" ON "import_rows" USING btree ("source_type","source_record_key");--> statement-breakpoint
CREATE UNIQUE INDEX "import_rows_content_hash_idx" ON "import_rows" USING btree ("source_type","content_hash");