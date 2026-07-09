-- Username Extractor — local dev seed (idempotent). Populates the E2E_BYPASS_AUTH test user's
-- leads table + one completed job (history), so the signed-in /leads and /jobs UIs render data
-- without running real extraction (which needs a connected BYO Cloudflare account).
-- Run: bun run seed   (→ wrangler d1 execute username-extractor --local --file ./seed/seed.sql)
-- NEVER run against --remote / production. Fixed ids + INSERT OR REPLACE = re-runnable.
-- Timestamp units match the Drizzle schema:
--   users.created_at/updated_at → integer(mode:"timestamp") = SECONDS  → unixepoch('now')
--   leads/jobs/job_items.*_at    → plain INTEGER = Unix epoch MS        → unixepoch(...)*1000
-- Owner is the synthesized bypass user (e2e-test-user).

-- Owning user row (FK target for leads/jobs). email_verified=1, seconds timestamps.
INSERT OR IGNORE INTO users (id, email, email_verified, name, image, created_at, updated_at)
VALUES ('e2e-test-user', 'e2e@test.local', 1, 'E2E Test User', NULL, unixepoch('now'), unixepoch('now'));

-- ── One completed job → renders in /jobs history with a verified/review/failed breakdown.
INSERT OR REPLACE INTO jobs
    (id, user_id, status, vlm_model, diagnostics, image_count, upload_complete, dedup_summary, created_at, completed_at)
VALUES
    ('seed-job-1', 'e2e-test-user', 'completed', '@cf/mistralai/mistral-small-3.1-24b-instruct', 0, 5, 1, NULL,
     unixepoch('now', '-5 days') * 1000, (unixepoch('now', '-5 days') + 174) * 1000);

-- Job items for seed-job-1 — mixed outcomes (verified / review / duplicate / failed).
INSERT OR REPLACE INTO job_items
    (id, job_id, filename, r2_key, status, username, platform, kind, confidence, tier,
     is_duplicate, is_near_duplicate, similar_to, edit_distance, raw_model_response, error, created_at, completed_at)
VALUES
    ('seed-item-1', 'seed-job-1', 'ig_profile_01.jpg', 'seed-job-1/ig_profile_01.jpg', 'verified', 'dhaka.streetwear', 'instagram', 'handle', 0.96, 'HIGH', 0, 0, NULL, NULL, NULL, NULL, unixepoch('now', '-5 days') * 1000, (unixepoch('now', '-5 days') + 40) * 1000),
    ('seed-item-2', 'seed-job-1', 'ig_profile_02.jpg', 'seed-job-1/ig_profile_02.jpg', 'verified', 'bd.skincare.co', 'instagram', 'handle', 0.93, 'HIGH', 0, 0, NULL, NULL, NULL, NULL, unixepoch('now', '-5 days') * 1000, (unixepoch('now', '-5 days') + 71) * 1000),
    ('seed-item-3', 'seed-job-1', 'ig_profile_03.jpg', 'seed-job-1/ig_profile_03.jpg', 'review', 'chittagong.eats', 'instagram', 'handle', 0.68, 'MED', 0, 0, NULL, NULL, NULL, NULL, unixepoch('now', '-5 days') * 1000, (unixepoch('now', '-5 days') + 102) * 1000),
    ('seed-item-4', 'seed-job-1', 'ig_profile_04.jpg', 'seed-job-1/ig_profile_04.jpg', 'duplicate', 'dhaka.streetwear', 'instagram', 'handle', 0.91, 'HIGH', 1, 1, 'dhaka.streetwear', 0, NULL, NULL, unixepoch('now', '-5 days') * 1000, (unixepoch('now', '-5 days') + 133) * 1000),
    ('seed-item-5', 'seed-job-1', 'ig_profile_05.jpg', 'seed-job-1/ig_profile_05.jpg', 'failed', NULL, 'instagram', NULL, NULL, NULL, 0, 0, NULL, NULL, NULL, 'No username detected in image', unixepoch('now', '-5 days') * 1000, (unixepoch('now', '-5 days') + 174) * 1000);

-- ── Lifetime leads (~10) → renders in /leads. Realistic Dhaka/BD Instagram handles, mixed
-- tiers (HIGH/MED) and notion_status (added=synced / pending / invalid / NULL=new-unsynced).
INSERT OR REPLACE INTO leads
    (id, user_id, username, platform, profile_url, kind, tier, confidence, source_job_id, notion_page_id, notion_status, notion_last_error, archived, created_at)
VALUES
    ('seed-lead-1',  'e2e-test-user', 'dhaka.streetwear',    'instagram', 'https://instagram.com/dhaka.streetwear',    'handle', 'HIGH', 0.96, 'seed-job-1', 'ntn-page-0001', 'added',   NULL, 0, unixepoch('now', '-5 days')  * 1000),
    ('seed-lead-2',  'e2e-test-user', 'bd.skincare.co',      'instagram', 'https://instagram.com/bd.skincare.co',      'handle', 'HIGH', 0.93, 'seed-job-1', 'ntn-page-0002', 'added',   NULL, 0, unixepoch('now', '-5 days')  * 1000),
    ('seed-lead-3',  'e2e-test-user', 'chittagong.eats',     'instagram', 'https://instagram.com/chittagong.eats',     'handle', 'MED',  0.68, 'seed-job-1', NULL,           'pending', 'Notion rate limit; retry later', 0, unixepoch('now', '-5 days') * 1000),
    ('seed-lead-4',  'e2e-test-user', 'rickshaw.rides.bd',   'instagram', 'https://instagram.com/rickshaw.rides.bd',   'handle', 'HIGH', 0.90, NULL,          NULL,           NULL,      NULL, 0, unixepoch('now', '-4 days')  * 1000),
    ('seed-lead-5',  'e2e-test-user', 'jamdani.weaves',      'instagram', 'https://instagram.com/jamdani.weaves',      'handle', 'HIGH', 0.94, NULL,          'ntn-page-0005', 'added',   NULL, 0, unixepoch('now', '-4 days')  * 1000),
    ('seed-lead-6',  'e2e-test-user', 'gulshan.thrift',      'instagram', 'https://instagram.com/gulshan.thrift',      'handle', 'MED',  0.72, NULL,          NULL,           NULL,      NULL, 0, unixepoch('now', '-3 days')  * 1000),
    ('seed-lead-7',  'e2e-test-user', 'panjabi.house.dhaka', 'instagram', 'https://instagram.com/panjabi.house.dhaka', 'handle', 'HIGH', 0.88, NULL,          NULL,           'invalid', 'Profile not found', 0, unixepoch('now', '-3 days') * 1000),
    ('seed-lead-8',  'e2e-test-user', 'banani.coffee.club',  'instagram', 'https://instagram.com/banani.coffee.club',  'handle', 'MED',  0.74, NULL,          'ntn-page-0008', 'added',   NULL, 0, unixepoch('now', '-2 days')  * 1000),
    ('seed-lead-9',  'e2e-test-user', 'sundarban.trails',    'instagram', 'https://instagram.com/sundarban.trails',    'handle', 'HIGH', 0.91, NULL,          NULL,           'pending', 'Notion database not selected', 0, unixepoch('now', '-1 days') * 1000),
    ('seed-lead-10', 'e2e-test-user', 'deshi.tech.reviews',  'instagram', 'https://instagram.com/deshi.tech.reviews',  'handle', 'MED',  0.70, NULL,          NULL,           NULL,      NULL, 0, unixepoch('now') * 1000);
