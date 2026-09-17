/**
 * Drains public.mux_asset_deletions: every row is a Mux asset whose post row
 * is gone (queued by the posts triggers in 20260917100000). Invoked by
 * pg_cron through pg_net once an hour, and safe to run by hand:
 *
 *   npx supabase functions invoke mux-cleanup --no-verify-jwt
 *
 * No auth on purpose: the function can only delete assets that are already
 * queued for deleted posts, so the worst an unauthenticated caller can do is
 * run the cleanup early. A missing asset (404) counts as deleted. Failures
 * stay queued with the error and are retried next run, up to 20 attempts.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { muxConfigured, muxRequest } from '../_shared/mux.ts'

/** DELETE the asset; a 404 means it is already gone. Throws otherwise. */
async function deleteAsset(assetId: string): Promise<void> {
  try {
    await muxRequest<void>(`/video/v1/assets/${encodeURIComponent(assetId)}`, { method: 'DELETE' })
  } catch (e) {
    if (/→ 404/.test((e as Error).message)) return
    throw e
  }
}

const MAX_ATTEMPTS = 20
const BATCH = 100

Deno.serve(async () => {
  if (!muxConfigured()) {
    return Response.json({ error: 'Mux is not configured' }, { status: 503 })
  }
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: queued, error } = await supabase
    .from('mux_asset_deletions')
    .select('asset_id, attempts')
    .lt('attempts', MAX_ATTEMPTS)
    .order('queued_at', { ascending: true })
    .limit(BATCH)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  let deleted = 0
  let failed = 0
  for (const row of queued ?? []) {
    let ok = false
    let message: string | null = null
    try {
      await deleteAsset(row.asset_id)
      ok = true
    } catch (e) {
      message = (e as Error).message
    }
    if (ok) {
      await supabase.from('mux_asset_deletions').delete().eq('asset_id', row.asset_id)
      deleted++
    } else {
      await supabase
        .from('mux_asset_deletions')
        .update({ attempts: row.attempts + 1, last_error: message ?? 'delete failed' })
        .eq('asset_id', row.asset_id)
      failed++
    }
  }

  const summary = { deleted, failed, remaining: (queued?.length ?? 0) - deleted }
  console.log('[mux-cleanup]', summary)
  return Response.json(summary)
})
