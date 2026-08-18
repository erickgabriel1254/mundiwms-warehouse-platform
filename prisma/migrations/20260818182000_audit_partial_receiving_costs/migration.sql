ALTER TABLE "inbound_orders" ADD COLUMN "importOrderId" TEXT;
ALTER TABLE "import_order_items" ADD COLUMN "receivedQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "inbound_order_items" ADD COLUMN "unitCost" DECIMAL(12, 2) NOT NULL DEFAULT 0;

CREATE TABLE "audit_logs" (
  "id" TEXT NOT NULL,
  "companyId" TEXT,
  "userId" TEXT,
  "action" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entityId" TEXT,
  "summary" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_companyId_createdAt_idx" ON "audit_logs"("companyId", "createdAt");
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

ALTER TABLE "inbound_orders" ADD CONSTRAINT "inbound_orders_importOrderId_fkey" FOREIGN KEY ("importOrderId") REFERENCES "import_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
