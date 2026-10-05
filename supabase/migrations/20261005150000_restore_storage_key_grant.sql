-- 20261005120000_dm_invite_cards ended with the usual blanket
-- "revoke all on all functions in schema spotted_private" and dropped the one
-- deliberate exception: storage_key is evaluated by the private-media
-- expression indexes on posts / dm_messages when an authenticated user
-- writes a row, so without EXECUTE every media post and DM photo failed with
-- "permission denied for function storage_key". Same grant as
-- 20260924191106_v1_private_media and 20260924213821_v1_beta_access_closure.
-- Any future blanket revoke on spotted_private must re-grant it after.
grant execute on function spotted_private.storage_key(text) to authenticated,service_role;
