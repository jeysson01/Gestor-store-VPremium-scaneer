CREATE TABLE IF NOT EXISTS "kiosk_codes" (
  "id" serial PRIMARY KEY NOT NULL,
  "code" varchar(3) NOT NULL,
  "qr_token" varchar(64) NOT NULL UNIQUE,
  "batch_id" varchar(36) NOT NULL,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "used_ip" varchar(45),
  "used_device" varchar(128),
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "kiosk_codes_batch_idx" ON "kiosk_codes" ("batch_id");
CREATE INDEX IF NOT EXISTS "kiosk_codes_expires_idx" ON "kiosk_codes" ("expires_at");
