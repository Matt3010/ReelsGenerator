CREATE TABLE `recent_prompts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tags` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tag_uses` (
	`category` text NOT NULL,
	`tag` text NOT NULL,
	`uses` integer DEFAULT 0 NOT NULL,
	`last_used` integer NOT NULL,
	PRIMARY KEY(`category`, `tag`)
);
