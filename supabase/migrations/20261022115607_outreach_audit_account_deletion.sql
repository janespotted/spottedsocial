-- Retain delivery audit history without preventing an operator from deleting
-- their account. Matches the existing launch_audit actor retention behavior.
alter table spotted_private.launch_outreach_batches
 alter column created_by drop not null,
 drop constraint launch_outreach_batches_created_by_fkey,
 add constraint launch_outreach_batches_created_by_fkey foreign key(created_by) references auth.users(id) on delete set null;
