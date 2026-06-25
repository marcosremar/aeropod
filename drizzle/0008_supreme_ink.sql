ALTER TABLE "projects" ADD COLUMN "media_type" varchar(20) DEFAULT 'audio';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "source_type" varchar(20);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "video_url" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "thumbnail_url" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "aspect_ratio" varchar(10) DEFAULT '16:9';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "video_duration" real;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "cut_ranges" jsonb;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "video_status" varchar(30);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "video_error" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "exported_video_url" text;