CREATE TABLE `guide_items` (
	`id` text PRIMARY KEY NOT NULL,
	`study_id` text NOT NULL,
	`text` text NOT NULL,
	`rationale` text DEFAULT '' NOT NULL,
	`probe_type` text DEFAULT 'manual' NOT NULL,
	`targets` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`source_reflection_id` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`study_id`) REFERENCES `studies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `guide_study_idx` ON `guide_items` (`study_id`);--> statement-breakpoint
CREATE TABLE `interviews` (
	`id` text PRIMARY KEY NOT NULL,
	`study_id` text NOT NULL,
	`label` text NOT NULL,
	`participant_note` text DEFAULT '' NOT NULL,
	`source` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`consent_at` text,
	`duration_sec` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`study_id`) REFERENCES `studies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `interviews_study_idx` ON `interviews` (`study_id`);--> statement-breakpoint
CREATE TABLE `probe_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`reflection_id` text NOT NULL,
	`probe_id` text NOT NULL,
	`action` text NOT NULL,
	`payload` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`reflection_id`) REFERENCES `reflections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `reflections` (
	`id` text PRIMARY KEY NOT NULL,
	`interview_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`stage` text DEFAULT '' NOT NULL,
	`config` text NOT NULL,
	`result` text,
	`warnings` text DEFAULT '[]' NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`usage` text,
	`error` text,
	`created_at` text NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`interview_id`) REFERENCES `interviews`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reflections_interview_idx` ON `reflections` (`interview_id`);--> statement-breakpoint
CREATE TABLE `segments` (
	`id` text PRIMARY KEY NOT NULL,
	`interview_id` text NOT NULL,
	`idx` integer NOT NULL,
	`speaker` text NOT NULL,
	`role` text NOT NULL,
	`text` text NOT NULL,
	`start_ms` integer,
	`end_ms` integer,
	FOREIGN KEY (`interview_id`) REFERENCES `interviews`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `segments_interview_idx` ON `segments` (`interview_id`,`idx`);--> statement-breakpoint
CREATE TABLE `studies` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`goal` text DEFAULT '' NOT NULL,
	`research_questions` text DEFAULT '[]' NOT NULL,
	`hypotheses` text DEFAULT '[]' NOT NULL,
	`context` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
