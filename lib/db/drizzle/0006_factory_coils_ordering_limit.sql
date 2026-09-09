ALTER TABLE "coils" ADD COLUMN "movido_a_fabrica_en" timestamp with time zone;--> statement-breakpoint
UPDATE "coils" SET "movido_a_fabrica_en" = "creado_en" WHERE "estado" = 'EN FÁBRICA' AND "movido_a_fabrica_en" IS NULL;--> statement-breakpoint
CREATE INDEX "coils_en_fabrica_idx" ON "coils" USING btree ("estado","movido_a_fabrica_en");--> statement-breakpoint
DELETE FROM "coils"
WHERE "id" IN (
  SELECT "id" FROM "coils"
  WHERE "estado" = 'EN FÁBRICA'
  ORDER BY "movido_a_fabrica_en" DESC NULLS LAST, "id" DESC
  OFFSET 25
);