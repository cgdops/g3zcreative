-- Migration 0007: Remove all Sunbiz leads and Sunbiz outreach candidates (Google Maps / Business Listings only)

-- 1. Delete child notes, enrichments, and tasks for Sunbiz-promoted leads
DELETE FROM lead_notes
WHERE lead_id IN (
  SELECT id FROM leads
  WHERE LOWER(COALESCE(source_page, '')) LIKE '%sunbiz%'
     OR LOWER(COALESCE(message, '')) LIKE '%sunbiz%'
     OR id IN (
       SELECT lead_id FROM outreach_candidates
       WHERE lead_id IS NOT NULL
         AND (place_id IS NULL OR TRIM(place_id) = '')
         AND (gbp_rank IS NULL OR gbp_rank <= 0)
         AND COALESCE(entity_type, '') != 'Google Maps GBP'
         AND COALESCE(doc_number, '') NOT LIKE 'MAP%'
         AND COALESCE(doc_number, '') NOT LIKE 'GBP%'
     )
);

DELETE FROM lead_enrichments
WHERE lead_id IN (
  SELECT id FROM leads
  WHERE LOWER(COALESCE(source_page, '')) LIKE '%sunbiz%'
     OR LOWER(COALESCE(message, '')) LIKE '%sunbiz%'
     OR id IN (
       SELECT lead_id FROM outreach_candidates
       WHERE lead_id IS NOT NULL
         AND (place_id IS NULL OR TRIM(place_id) = '')
         AND (gbp_rank IS NULL OR gbp_rank <= 0)
         AND COALESCE(entity_type, '') != 'Google Maps GBP'
         AND COALESCE(doc_number, '') NOT LIKE 'MAP%'
         AND COALESCE(doc_number, '') NOT LIKE 'GBP%'
     )
);

DELETE FROM lead_tasks
WHERE lead_id IN (
  SELECT id FROM leads
  WHERE LOWER(COALESCE(source_page, '')) LIKE '%sunbiz%'
     OR LOWER(COALESCE(message, '')) LIKE '%sunbiz%'
     OR id IN (
       SELECT lead_id FROM outreach_candidates
       WHERE lead_id IS NOT NULL
         AND (place_id IS NULL OR TRIM(place_id) = '')
         AND (gbp_rank IS NULL OR gbp_rank <= 0)
         AND COALESCE(entity_type, '') != 'Google Maps GBP'
         AND COALESCE(doc_number, '') NOT LIKE 'MAP%'
         AND COALESCE(doc_number, '') NOT LIKE 'GBP%'
     )
);

-- 2. Unlink and delete Sunbiz leads from leads table
UPDATE outreach_candidates
SET lead_id = NULL
WHERE lead_id IN (
  SELECT id FROM leads
  WHERE LOWER(COALESCE(source_page, '')) LIKE '%sunbiz%'
     OR LOWER(COALESCE(message, '')) LIKE '%sunbiz%'
);

DELETE FROM leads
WHERE LOWER(COALESCE(source_page, '')) LIKE '%sunbiz%'
   OR LOWER(COALESCE(message, '')) LIKE '%sunbiz%'
   OR id IN (
     SELECT lead_id FROM outreach_candidates
     WHERE lead_id IS NOT NULL
       AND (place_id IS NULL OR TRIM(place_id) = '')
       AND (gbp_rank IS NULL OR gbp_rank <= 0)
       AND COALESCE(entity_type, '') != 'Google Maps GBP'
       AND COALESCE(doc_number, '') NOT LIKE 'MAP%'
       AND COALESCE(doc_number, '') NOT LIKE 'GBP%'
   );

-- 3. Delete all Sunbiz outreach candidates (keep only Google Maps / Business Listings)
DELETE FROM outreach_candidates
WHERE (place_id IS NULL OR TRIM(place_id) = '')
  AND (gbp_rank IS NULL OR gbp_rank <= 0)
  AND COALESCE(entity_type, '') != 'Google Maps GBP'
  AND COALESCE(doc_number, '') NOT LIKE 'MAP%'
  AND COALESCE(doc_number, '') NOT LIKE 'GBP%';
