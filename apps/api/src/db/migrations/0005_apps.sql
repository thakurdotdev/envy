CREATE TABLE "apps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DROP INDEX "environments_project_name_unique";--> statement-breakpoint
ALTER TABLE "environments" ADD COLUMN "app_id" uuid;--> statement-breakpoint
ALTER TABLE "service_tokens" ADD COLUMN "layer_environment_ids" uuid[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "apps_project_name_unique" ON "apps" USING btree ("project_id","name") WHERE "apps"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "environments_app_id_index" ON "environments" USING btree ("app_id");--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_project_app_name_unique" UNIQUE NULLS NOT DISTINCT("project_id","app_id","name");