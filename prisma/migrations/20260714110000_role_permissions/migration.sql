ALTER TABLE "roles" ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "roles"
SET "permissions" = ARRAY[
  'dashboard:view',
  'products:manage',
  'inventory:view',
  'warehouses:manage',
  'inbound:manage',
  'outbound:manage',
  'kardex:view',
  'adjustments:manage',
  'contacts:manage',
  'reports:view',
  'users:manage',
  'roles:manage',
  'delete:restricted'
]
WHERE "code" = 'ADMIN';

UPDATE "roles"
SET "permissions" = ARRAY[
  'dashboard:view',
  'products:manage',
  'inventory:view',
  'warehouses:manage',
  'inbound:manage',
  'outbound:manage',
  'kardex:view',
  'adjustments:manage',
  'contacts:manage',
  'reports:view',
  'delete:restricted'
]
WHERE "code" = 'SUPERVISOR';

UPDATE "roles"
SET "permissions" = ARRAY[
  'dashboard:view',
  'inventory:view',
  'inbound:manage',
  'outbound:manage',
  'kardex:view',
  'adjustments:manage'
]
WHERE "code" = 'OPERATOR';
