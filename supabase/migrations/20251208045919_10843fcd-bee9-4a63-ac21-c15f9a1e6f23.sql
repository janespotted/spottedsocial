-- Delete The Galley (it's a seafood restaurant, not a bar/nightclub)
DELETE FROM night_statuses WHERE venue_id = '2281869d-8c86-49a2-8d32-93caa2b37b3d' OR venue_name = 'The Galley';
DELETE FROM venue_buzz_messages WHERE venue_id = '2281869d-8c86-49a2-8d32-93caa2b37b3d' OR venue_name = 'The Galley';
DELETE FROM venue_reviews WHERE venue_id = '2281869d-8c86-49a2-8d32-93caa2b37b3d';
DELETE FROM stories WHERE venue_id = '2281869d-8c86-49a2-8d32-93caa2b37b3d';
DELETE FROM checkins WHERE venue_id = '2281869d-8c86-49a2-8d32-93caa2b37b3d' OR venue_name = 'The Galley';
DELETE FROM posts WHERE venue_id = '2281869d-8c86-49a2-8d32-93caa2b37b3d' OR venue_name = 'The Galley';
DELETE FROM venues WHERE id = '2281869d-8c86-49a2-8d32-93caa2b37b3d';