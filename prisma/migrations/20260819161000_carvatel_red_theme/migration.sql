UPDATE "companies"
SET "theme" = 'red', "primaryColor" = '#dc2626';

UPDATE "companies"
SET "code" = 'CARVATEL', "name" = 'Carvatel'
WHERE "id" = 'company_ferremayor' OR "code" = 'FERREMAYOR';

UPDATE "companies"
SET "code" = 'CARVATEL-SUC', "name" = 'Carvatel Sucursal'
WHERE "id" = 'company_ferrilopez' OR "code" = 'FERRILOPEZ';

UPDATE "companies"
SET "code" = 'CARVATEL-MATRIZ', "name" = 'Carvatel Matriz'
WHERE "id" = 'company_mundimaquinas' OR "code" = 'MUNDIMAQUINAS';

UPDATE "companies"
SET "code" = 'CARVATEL-TIENDA', "name" = 'Carvatel Tienda'
WHERE "id" = 'company_sirumaz' OR "code" = 'SIRUMAZ';
