-- Feed image performance: the client stores the media's pixel size and a
-- ThumbHash next to the storage path so the feed can reserve the frame and
-- paint a blurred preview before the first byte of the image arrives.
-- Nullable: legacy rows, videos and demo/web posts leave them empty.
alter table public.posts
  add column if not exists media_width integer,
  add column if not exists media_height integer,
  add column if not exists media_hash text;

comment on column public.posts.media_width is 'Pixel width of the uploaded media (after client-side resize).';
comment on column public.posts.media_height is 'Pixel height of the uploaded media (after client-side resize).';
comment on column public.posts.media_hash is 'ThumbHash (base64) of the media, rendered as the loading placeholder.';
