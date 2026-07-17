CREATE TABLE "product_location_defaults" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_location_defaults_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_location_defaults_productId_warehouseId_key" ON "product_location_defaults"("productId", "warehouseId");

ALTER TABLE "product_location_defaults" ADD CONSTRAINT "product_location_defaults_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_location_defaults" ADD CONSTRAINT "product_location_defaults_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_location_defaults" ADD CONSTRAINT "product_location_defaults_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "product_location_defaults" ("id", "productId", "warehouseId", "locationId", "updatedAt")
SELECT
  'pld_' || substr(md5(p."id" || w."id"), 1, 20),
  p."id",
  w."id",
  l."id",
  NOW()
FROM "products" p
CROSS JOIN "warehouses" w
JOIN LATERAL (
  SELECT "id"
  FROM "locations"
  WHERE "warehouseId" = w."id"
  ORDER BY CASE WHEN "code" = 'ALM' THEN 0 WHEN "code" = 'REC' THEN 1 ELSE 2 END, "code"
  LIMIT 1
) l ON true
ON CONFLICT ("productId", "warehouseId") DO NOTHING;
