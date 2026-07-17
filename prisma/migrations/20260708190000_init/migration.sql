CREATE TABLE "roles" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "users" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "roleId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "products" (
  "id" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "brand" TEXT NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'Unidad',
  "stockMin" INTEGER NOT NULL DEFAULT 1,
  "managesSerial" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "warehouses" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "locations" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_units" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "serialNumber" TEXT,
  "warehouseId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_units_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_balances" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "clients" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "taxId" TEXT NOT NULL,
  "contact" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "suppliers" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "taxId" TEXT NOT NULL,
  "contact" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inbound_orders" (
  "id" TEXT NOT NULL,
  "orderNo" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "createdById" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inbound_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inbound_order_items" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "serialNumbers" TEXT[] DEFAULT ARRAY[]::TEXT[],
  CONSTRAINT "inbound_order_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outbound_orders" (
  "id" TEXT NOT NULL,
  "orderNo" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "createdById" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "outbound_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outbound_order_items" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "serialNumbers" TEXT[] DEFAULT ARRAY[]::TEXT[],
  CONSTRAINT "outbound_order_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "kardex_movements" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "inventoryUnitId" TEXT,
  "quantity" INTEGER NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "userId" TEXT,
  "documentType" TEXT NOT NULL,
  "documentNo" TEXT NOT NULL,
  "observation" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "kardex_movements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_adjustments" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "inventoryUnitId" TEXT,
  "quantity" INTEGER NOT NULL,
  "fromLocationId" TEXT,
  "toLocationId" TEXT,
  "reason" TEXT NOT NULL,
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");
CREATE UNIQUE INDEX "locations_warehouseId_code_key" ON "locations"("warehouseId", "code");
CREATE UNIQUE INDEX "inventory_units_productId_serialNumber_key" ON "inventory_units"("productId", "serialNumber");
CREATE INDEX "inventory_units_serialNumber_idx" ON "inventory_units"("serialNumber");
CREATE INDEX "inventory_units_status_idx" ON "inventory_units"("status");
CREATE UNIQUE INDEX "inventory_balances_productId_warehouseId_locationId_status_key" ON "inventory_balances"("productId", "warehouseId", "locationId", "status");
CREATE UNIQUE INDEX "clients_taxId_key" ON "clients"("taxId");
CREATE UNIQUE INDEX "suppliers_taxId_key" ON "suppliers"("taxId");
CREATE UNIQUE INDEX "inbound_orders_orderNo_key" ON "inbound_orders"("orderNo");
CREATE UNIQUE INDEX "outbound_orders_orderNo_key" ON "outbound_orders"("orderNo");
CREATE INDEX "kardex_movements_type_idx" ON "kardex_movements"("type");
CREATE INDEX "kardex_movements_createdAt_idx" ON "kardex_movements"("createdAt");

ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "locations" ADD CONSTRAINT "locations_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inbound_orders" ADD CONSTRAINT "inbound_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inbound_orders" ADD CONSTRAINT "inbound_orders_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inbound_orders" ADD CONSTRAINT "inbound_orders_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inbound_orders" ADD CONSTRAINT "inbound_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inbound_order_items" ADD CONSTRAINT "inbound_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "inbound_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inbound_order_items" ADD CONSTRAINT "inbound_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "outbound_orders" ADD CONSTRAINT "outbound_orders_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "outbound_orders" ADD CONSTRAINT "outbound_orders_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "outbound_orders" ADD CONSTRAINT "outbound_orders_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "outbound_orders" ADD CONSTRAINT "outbound_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "outbound_order_items" ADD CONSTRAINT "outbound_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "outbound_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "outbound_order_items" ADD CONSTRAINT "outbound_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kardex_movements" ADD CONSTRAINT "kardex_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kardex_movements" ADD CONSTRAINT "kardex_movements_inventoryUnitId_fkey" FOREIGN KEY ("inventoryUnitId") REFERENCES "inventory_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "kardex_movements" ADD CONSTRAINT "kardex_movements_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kardex_movements" ADD CONSTRAINT "kardex_movements_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kardex_movements" ADD CONSTRAINT "kardex_movements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_inventoryUnitId_fkey" FOREIGN KEY ("inventoryUnitId") REFERENCES "inventory_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
