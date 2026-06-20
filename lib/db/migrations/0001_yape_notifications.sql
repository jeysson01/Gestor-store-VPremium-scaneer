ALTER TABLE "purchases" ADD COLUMN "yape_received_at" timestamp;--> statement-breakpoint
CREATE TABLE "yape_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"purchase_id" integer,
	"purchase_number" varchar(50),
	"yape_phone" varchar(20) DEFAULT '914713706' NOT NULL,
	"message" text NOT NULL,
	"source" varchar(30) DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now()
);--> statement-breakpoint
ALTER TABLE "yape_notifications" ADD CONSTRAINT "yape_notifications_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "yape_notifications_created_at_idx" ON "yape_notifications" USING btree ("created_at");
