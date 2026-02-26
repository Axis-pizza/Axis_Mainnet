CREATE TABLE `invites` (
	`code` text PRIMARY KEY NOT NULL,
	`creator_id` text NOT NULL,
	`used_by_user_id` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `strategies` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_pubkey` text,
	`name` text,
	`ticker` text,
	`type` text,
	`description` text,
	`config` text,
	`jito_bundle_id` text,
	`status` text,
	`total_deposited` real,
	`is_public` integer,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `strategy_deployment_baseline` (
	`strategy_id` text PRIMARY KEY NOT NULL,
	`baseline_ts_bucket_utc` integer,
	`baseline_price` real,
	`baseline_confidence` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `strategy_price_snapshots` (
	`strategy_id` text NOT NULL,
	`ts_bucket_utc` integer NOT NULL,
	`index_price` real,
	`prices_json` text,
	`weights_json` text,
	`source_json` text,
	`confidence` text,
	`version` integer,
	`metadata_json` text,
	`created_at` integer,
	PRIMARY KEY(`strategy_id`, `ts_bucket_utc`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`wallet_address` text NOT NULL,
	`name` text,
	`avatar_url` text,
	`twitter_id` text,
	`google_id` text,
	`invite_code` text,
	`invite_code_used` text,
	`otp_code` text,
	`otp_expires` integer,
	`last_faucet_at` integer,
	`total_invested_usd` real,
	`last_snapshot_at` integer,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_wallet_address_unique` ON `users` (`wallet_address`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_invite_code_unique` ON `users` (`invite_code`);--> statement-breakpoint
CREATE TABLE `vaults` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`symbol` text,
	`description` text,
	`creator` text,
	`strategy_type` text,
	`management_fee` real,
	`min_liquidity` real,
	`composition` text,
	`image_url` text,
	`tvl` real,
	`apy` real,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `watchlist` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`strategy_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `xp_ledger` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_pubkey` text,
	`amount` real,
	`action_type` text,
	`description` text,
	`related_id` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `xp_rates` (
	`strategy_id` text PRIMARY KEY NOT NULL,
	`base_rate` real,
	`is_active` integer
);
--> statement-breakpoint
CREATE TABLE `xp_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_pubkey` text,
	`strategy_id` text,
	`amount_usd` real,
	`capped_usd` real,
	`snapshot_at` integer,
	`is_processed` integer
);
