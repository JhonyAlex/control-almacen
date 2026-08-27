CREATE TABLE "production_order_pedidos" (
	"id" serial PRIMARY KEY NOT NULL,
	"orden_id" integer NOT NULL,
	"event_id" uuid NOT NULL,
	"pedido_id" text NOT NULL,
	"numero_pedido_cliente" text NOT NULL,
	"metros" numeric(14, 2) NOT NULL,
	"vinculado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_order_pedidos_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "origen" text DEFAULT 'MANUAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "production_order_pedidos" ADD CONSTRAINT "production_order_pedidos_orden_id_production_orders_id_fk" FOREIGN KEY ("orden_id") REFERENCES "public"."production_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "production_order_pedidos_orden_id_idx" ON "production_order_pedidos" USING btree ("orden_id");--> statement-breakpoint
CREATE INDEX "production_order_pedidos_pedido_id_idx" ON "production_order_pedidos" USING btree ("pedido_id");--> statement-breakpoint
CREATE UNIQUE INDEX "production_orders_gp_active_group_idx" ON "production_orders" USING btree ("ancho","micras",lower(trim("material")),trim("camisa")) WHERE "production_orders"."estado" = 'ACTIVA' AND "production_orders"."origen" = 'GESTION_PEDIDOS';