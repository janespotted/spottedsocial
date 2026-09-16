-- profiles.show_read_receipts was referenced by both the web
-- (ReadReceiptsToggle, DM "Seen") and mobile (Settings toggle, thread "Seen")
-- clients and by the generated types, but never existed on this project —
-- the toggle failed silently and "Seen" could never show. Default on, so the
-- feature works out of the box and users opt out.
alter table public.profiles
  add column if not exists show_read_receipts boolean not null default true;

comment on column public.profiles.show_read_receipts is
  'Show "Seen" in DMs. Both participants must have it on for receipts to display.';
