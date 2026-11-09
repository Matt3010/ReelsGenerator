DROP TABLE `asset_tags`;--> statement-breakpoint
DROP INDEX `assets_prompt_key`;--> statement-breakpoint
DROP INDEX `assets_style`;--> statement-breakpoint
ALTER TABLE `assets` DROP COLUMN `prompt_key`;--> statement-breakpoint
ALTER TABLE `assets` DROP COLUMN `uses`;