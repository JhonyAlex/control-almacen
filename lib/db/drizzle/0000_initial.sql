CREATE TABLE "coils" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"metros" numeric(14, 2) NOT NULL,
	"ancho" numeric(12, 2) NOT NULL,
	"micras" numeric(12, 2) NOT NULL,
	"camisa" text NOT NULL,
	"material" text NOT NULL,
	"estado" text DEFAULT 'DISPONIBLE' NOT NULL,
	"orden_id" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"ancho" numeric(12, 2) NOT NULL,
	"micras" numeric(12, 2) NOT NULL,
	"camisa" text NOT NULL,
	"material" text NOT NULL,
	"metros_necesarios" numeric(14, 2) NOT NULL,
	"estado" text DEFAULT 'ACTIVA' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"finalizada_en" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "coils" ADD CONSTRAINT "coils_orden_id_production_orders_id_fk" FOREIGN KEY ("orden_id") REFERENCES "public"."production_orders"("id") ON DELETE no action ON UPDATE no action;