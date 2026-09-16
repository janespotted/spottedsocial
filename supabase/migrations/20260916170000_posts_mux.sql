-- Video posts move to Mux. The phone uploads straight to a Mux direct-upload
-- URL (minted by the mux-create-upload edge function), inserts the row with
-- the upload id, and the mux-webhook function fills in the asset + playback
-- ids when Mux finishes encoding. image_url stays null for these rows.
--
-- mux_status: 'preparing' (uploaded, encoding) → 'ready' (playable) or
-- 'errored'. Feed readers show a processing tile until 'ready'.
alter table public.posts
  add column if not exists mux_upload_id text,
  add column if not exists mux_asset_id text,
  add column if not exists mux_playback_id text,
  add column if not exists mux_status text;

alter table public.posts
  drop constraint if exists posts_mux_status_check;
alter table public.posts
  add constraint posts_mux_status_check
  check (mux_status is null or mux_status in ('preparing', 'ready', 'errored'));

-- The webhook looks rows up by upload id first, asset id after; the nightly
-- cleanup deletes Mux assets for expired rows by asset id.
create index if not exists posts_mux_upload_id_idx on public.posts (mux_upload_id) where mux_upload_id is not null;
create index if not exists posts_mux_asset_id_idx on public.posts (mux_asset_id) where mux_asset_id is not null;

comment on column public.posts.mux_upload_id is 'Mux direct upload id; set by the client at insert.';
comment on column public.posts.mux_asset_id is 'Mux asset id; set by mux-webhook on video.upload.asset_created.';
comment on column public.posts.mux_playback_id is 'Mux public playback id; set by mux-webhook on video.asset.ready.';
comment on column public.posts.mux_status is 'preparing | ready | errored (null for non-Mux media).';
