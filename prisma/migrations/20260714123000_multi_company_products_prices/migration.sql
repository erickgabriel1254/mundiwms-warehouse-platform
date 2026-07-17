CREATE TABLE "companies" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "theme" TEXT NOT NULL DEFAULT 'orange',
  "primaryColor" TEXT NOT NULL DEFAULT '#ea580c',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "companies_code_key" ON "companies"("code");

INSERT INTO "companies" ("id", "code", "name", "theme", "primaryColor")
VALUES
  ('company_mundimaquinas', 'MUNDIMAQUINAS', 'Mundimaquinas', 'orange', '#ea580c'),
  ('company_sirumaz', 'SIRUMAZ', 'Sirumaz', 'blue', '#2563eb')
ON CONFLICT ("code") DO NOTHING;

ALTER TABLE "products" ADD COLUMN "barcode" TEXT;
ALTER TABLE "products" ADD COLUMN "barcodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "products" ADD COLUMN "purchasePrice" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "products" ADD COLUMN "salePrice" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "warehouses" ADD COLUMN "companyId" TEXT;
UPDATE "warehouses" SET "companyId" = 'company_mundimaquinas' WHERE "companyId" IS NULL;
ALTER TABLE "warehouses" ALTER COLUMN "companyId" SET NOT NULL;

ALTER TABLE "clients" ADD COLUMN "companyId" TEXT;
UPDATE "clients" SET "companyId" = 'company_mundimaquinas' WHERE "companyId" IS NULL;
ALTER TABLE "clients" ALTER COLUMN "companyId" SET NOT NULL;

ALTER TABLE "suppliers" ADD COLUMN "companyId" TEXT;
UPDATE "suppliers" SET "companyId" = 'company_mundimaquinas' WHERE "companyId" IS NULL;
ALTER TABLE "suppliers" ALTER COLUMN "companyId" SET NOT NULL;

ALTER TABLE "inbound_orders" ADD COLUMN "companyId" TEXT;
UPDATE "inbound_orders" SET "companyId" = 'company_mundimaquinas' WHERE "companyId" IS NULL;
ALTER TABLE "inbound_orders" ALTER COLUMN "companyId" SET NOT NULL;

ALTER TABLE "outbound_orders" ADD COLUMN "companyId" TEXT;
UPDATE "outbound_orders" SET "companyId" = 'company_mundimaquinas' WHERE "companyId" IS NULL;
ALTER TABLE "outbound_orders" ALTER COLUMN "companyId" SET NOT NULL;

DROP INDEX IF EXISTS "warehouses_code_key";
DROP INDEX IF EXISTS "clients_taxId_key";
DROP INDEX IF EXISTS "suppliers_taxId_key";

CREATE UNIQUE INDEX "warehouses_companyId_code_key" ON "warehouses"("companyId", "code");
CREATE UNIQUE INDEX "clients_companyId_taxId_key" ON "clients"("companyId", "taxId");
CREATE UNIQUE INDEX "suppliers_companyId_taxId_key" ON "suppliers"("companyId", "taxId");

ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clients" ADD CONSTRAINT "clients_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inbound_orders" ADD CONSTRAINT "inbound_orders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "outbound_orders" ADD CONSTRAINT "outbound_orders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
