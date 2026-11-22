CREATE TYPE "public"."actor_type" AS ENUM('user', 'token');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'member', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('pending', 'active');--> statement-breakpoint
CREATE TYPE "public"."recipient_type" AS ENUM('user', 'token');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"metadata" jsonb,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "environment_keys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"environment_id" uuid NOT NULL,
	"key_version" integer NOT NULL,
	"recipient_type" "recipient_type" NOT NULL,
	"recipient_id" uuid NOT NULL,
	"wrapped_key" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "environments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_shared" boolean DEFAULT false NOT NULL,
	"is_protected" boolean DEFAULT false NOT NULL,
	"current_key_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" NOT NULL,
	"status" "member_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "secret_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"environment_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"key_version" integer NOT NULL,
	"ciphertext" text NOT NULL,
	"nonce" text NOT NULL,
	"author_id" uuid NOT NULL,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_keys" ADD CONSTRAINT "environment_keys_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_keys" ADD CONSTRAINT "environment_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_versions" ADD CONSTRAINT "secret_versions_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_versions" ADD CONSTRAINT "secret_versions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_project_created_index" ON "audit_log" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "environment_keys_recipient_unique" ON "environment_keys" USING btree ("environment_id","key_version","recipient_type","recipient_id");--> statement-breakpoint
CREATE INDEX "environment_keys_created_by_index" ON "environment_keys" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "environments_project_name_unique" ON "environments" USING btree ("project_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "members_project_user_unique" ON "members" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "members_user_id_index" ON "members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "projects_owner_id_index" ON "projects" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_owner_slug_unique" ON "projects" USING btree ("owner_id","slug") WHERE "projects"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "secret_versions_environment_version_unique" ON "secret_versions" USING btree ("environment_id","version" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "secret_versions_author_id_index" ON "secret_versions" USING btree ("author_id");