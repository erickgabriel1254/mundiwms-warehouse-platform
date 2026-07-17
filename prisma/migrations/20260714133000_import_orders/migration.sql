CREATE TABLE "import_orders" (
  "id" TEXT NOT NULL,
  "orderNo" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "purchaseOrder" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "import_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "import_order_items" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  CONSTRAINT "import_order_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "import_orders_orderNo_key" ON "import_orders"("orderNo");

ALTER TABLE "import_orders" ADD CONSTRAINT "import_orders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "import_orders" ADD CONSTRAINT "import_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "import_orders" ADD CONSTRAINT "import_orders_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "import_orders" ADD CONSTRAINT "import_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "import_order_items" ADD CONSTRAINT "import_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "import_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "import_order_items" ADD CONSTRAINT "import_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
