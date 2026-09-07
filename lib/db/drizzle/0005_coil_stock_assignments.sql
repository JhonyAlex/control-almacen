CREATE TABLE "production_order_coil_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"coil_id" integer NOT NULL,
	"orden_id" integer NOT NULL,
	"metros" numeric(14, 2) NOT NULL,
	"origen" text DEFAULT 'AUTO_STOCK' NOT NULL,
	"asignado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "production_order_coil_assignments" ADD CONSTRAINT "production_order_coil_assignments_coil_id_coils_id_fk" FOREIGN KEY ("coil_id") REFERENCES "public"."coils"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_coil_assignments" ADD CONSTRAINT "production_order_coil_assignments_orden_id_production_orders_id_fk" FOREIGN KEY ("orden_id") REFERENCES "public"."production_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "production_order_coil_assignments_coil_id_key" ON "production_order_coil_assignments" USING btree ("coil_id");--> statement-breakpoint
CREATE INDEX "production_order_coil_assignments_orden_id_idx" ON "production_order_coil_assignments" USING btree ("orden_id");--> statement-breakpoint
CREATE INDEX "coils_disponible_match_idx" ON "coils" USING btree ("estado","ancho","micras");