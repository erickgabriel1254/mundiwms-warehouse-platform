ALTER TABLE "outbound_orders" ADD COLUMN "carrierName" TEXT;
ALTER TABLE "outbound_orders" ADD COLUMN "guideNumber" TEXT;
ALTER TABLE "outbound_orders" ADD COLUMN "deliveryAddress" TEXT;
ALTER TABLE "outbound_orders" ADD COLUMN "receiverName" TEXT;
ALTER TABLE "outbound_orders" ADD COLUMN "shippingNotes" TEXT;
ALTER TABLE "outbound_orders" ADD COLUMN "shippedAt" TIMESTAMP(3);
