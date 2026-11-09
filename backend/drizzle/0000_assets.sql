CREATE TABLE `asset_tags` (
	`asset_id` integer NOT NULL,
	`tag` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`asset_id`, `tag`),
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `asset_tags_tag` ON `asset_tags` (`tag`);--> statement-breakpoint
CREATE TABLE `assets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sha256` text NOT NULL,
	`file` text NOT NULL,
	`prompt` text NOT NULL,
	`prompt_key` text NOT NULL,
	`style` text NOT NULL,
	`seed` integer NOT NULL,
	`model` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`uses` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assets_sha256_unique` ON `assets` (`sha256`);--> statement-breakpoint
CREATE INDEX `assets_prompt_key` ON `assets` (`prompt_key`);--> statement-breakpoint
CREATE INDEX `assets_style` ON `assets` (`style`);