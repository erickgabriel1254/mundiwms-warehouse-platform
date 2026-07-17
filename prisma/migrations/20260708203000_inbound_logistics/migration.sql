ALTER TABLE "inbound_orders" ADD COLUMN "carrierName" TEXT;
ALTER TABLE "inbound_orders" ADD COLUMN "guideNumber" TEXT;
ALTER TABLE "inbound_order_items" ADD COLUMN "locationId" TEXT;
ALTER TABLE "inbound_order_items" ADD CONSTRAINT "inbound_order_items_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
