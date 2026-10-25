export interface SharedVenueVisit {
  venue_id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  expires_at: number;
}

/** Server-authorized historical audiences only. Never infer history from current friends. */
export function collectVenueVisits(rows: unknown, viewer: string, now: number): SharedVenueVisit[] {
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  return rows.flatMap(row => {
    if (!row || typeof row.venue_id !== 'string' || typeof row.user_id !== 'string'
      || typeof row.display_name !== 'string') return [];
    const expiry = Date.parse(row.expires_at ?? '');
    const key = `${row.venue_id}:${row.user_id}`;
    if (row.user_id === viewer || seen.has(key) || !(expiry > now)) return [];
    seen.add(key);
    return [{ venue_id: row.venue_id, user_id: row.user_id, display_name: row.display_name,
      avatar_url: typeof row.avatar_url === 'string' ? row.avatar_url : null, expires_at: expiry }];
  });
}
