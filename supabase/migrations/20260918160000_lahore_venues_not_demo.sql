-- ═════════════════════════════════════════════════════════════════════
-- Lahore venues are real rows in a hidden city, not is_demo rows.
--
-- Marking them is_demo = true looked right but made them invisible to the
-- very code the developer needs to test: every venue query hard-codes
-- `is_demo = false` (map, check-in search, search screen) and so does the
-- find_nearest_venue() function, so venue detection and arrival prompts
-- could never match a Lahore spot.
--
-- Venues are already scoped by `city`, and no real user can select Lahore
-- (the picker hides it unless demo mode is on — lib/city-neighborhoods.ts
-- DEMO_CITIES). That city filter is the isolation; is_demo is not needed
-- and actively breaks detection.
--
-- Demo USERS and their content keep is_demo = true — that flag still means
-- "seeded fake people", which is what the rest of the app assumes.
-- ═════════════════════════════════════════════════════════════════════

update public.venues set is_demo = false where city = 'lhr';
