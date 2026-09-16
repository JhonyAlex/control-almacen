CREATE TABLE "production_order_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"orden_id" integer NOT NULL,
	"usuario_id" integer,
	"accion" text NOT NULL,
	"detalle" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "production_order_events" ADD CONSTRAINT "production_order_events_orden_id_production_orders_id_fk" FOREIGN KEY ("orden_id") REFERENCES "public"."production_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_events" ADD CONSTRAINT "production_order_events_usuario_id_users_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "production_order_events_orden_id_idx" ON "production_order_events" USING btree ("orden_id");