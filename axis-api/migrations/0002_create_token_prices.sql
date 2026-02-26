CREATE TABLE `token_prices` (
	`token_name` text NOT NULL,
	`recorded_at` integer NOT NULL,
	`price_usd` real,
	PRIMARY KEY(`token_name`, `recorded_at`)
);
