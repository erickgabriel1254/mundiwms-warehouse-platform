ALTER TABLE "import_orders" DROP CONSTRAINT IF EXISTS "import_orders_warehouseId_fkey";
ALTER TABLE "import_orders" DROP COLUMN IF EXISTS "warehouseId";
