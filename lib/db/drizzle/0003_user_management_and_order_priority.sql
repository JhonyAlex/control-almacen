ALTER TABLE "production_orders" ADD COLUMN "orden" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "production_orders_orden_idx" ON "production_orders" USING btree ("orden");