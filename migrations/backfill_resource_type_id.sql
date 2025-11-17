-- Migration: Backfill resourceTypeId in resource_rates table
-- This script populates the resource_type_id FK column by matching
-- the legacy res_type text field with resource_types.res_type

BEGIN;

-- Step 1: Backfill resource_type_id by joining on company and res_type
UPDATE resource_rates rr
SET resource_type_id = rt.id
FROM projects p
JOIN resource_types rt ON rt.company_id = p.company_id 
  AND UPPER(rt.res_type) = UPPER(COALESCE(rr.res_type, ''))
WHERE rr.project_id = p.id
  AND rr.resource_type_id IS NULL
  AND rr.res_type IS NOT NULL;

-- Step 2: Report any unmapped rows (should be none if all codes exist)
DO $$
DECLARE
  unmapped_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unmapped_count
  FROM resource_rates
  WHERE resource_type_id IS NULL AND res_type IS NOT NULL;
  
  IF unmapped_count > 0 THEN
    RAISE WARNING 'Found % rows with res_type but no matching resource_type_id!', unmapped_count;
    RAISE WARNING 'Run this query to see them: SELECT project_id, code, res_type FROM resource_rates WHERE resource_type_id IS NULL AND res_type IS NOT NULL';
  ELSE
    RAISE NOTICE 'All resource_rates successfully mapped to resource_types';
  END IF;
END$$;

-- Step 3: Make resource_type_id NOT NULL (will fail if unmapped rows exist)
ALTER TABLE resource_rates 
  ALTER COLUMN resource_type_id SET NOT NULL;

-- Step 4: Drop the legacy res_type column
ALTER TABLE resource_rates 
  DROP COLUMN res_type;

COMMIT;
