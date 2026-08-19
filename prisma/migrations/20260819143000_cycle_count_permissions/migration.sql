UPDATE "roles"
SET "permissions" = ARRAY(
  SELECT DISTINCT permission
  FROM unnest("permissions" || ARRAY['cycle-count:manage', 'cycle-count:approve']::TEXT[]) AS permission
)
WHERE "code" IN ('ADMIN', 'SUPERVISOR');

UPDATE "roles"
SET "permissions" = ARRAY(
  SELECT DISTINCT permission
  FROM unnest("permissions" || ARRAY['cycle-count:manage']::TEXT[]) AS permission
)
WHERE "code" = 'OPERATOR';
