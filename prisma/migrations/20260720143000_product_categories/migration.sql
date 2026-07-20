CREATE TABLE "product_categories" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_categories_code_key" ON "product_categories"("code");
CREATE UNIQUE INDEX "product_categories_name_key" ON "product_categories"("name");

INSERT INTO "product_categories" ("id", "code", "name", "status", "createdAt", "updatedAt")
SELECT
  'cat_' || md5(trim("category")),
  upper(regexp_replace(trim("category"), '[^A-Za-z0-9]+', '_', 'g')),
  trim("category"),
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "products"
WHERE trim("category") <> ''
GROUP BY trim("category")
ON CONFLICT ("name") DO NOTHING;
