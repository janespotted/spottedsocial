/** Reconcile HTTP and realtime in either order without duplicating a server ID. */
export function confirmMessage<T extends { id: string }>(rows: T[], pendingId: string, saved: T, stillVisible = true): T[] {
  const position = rows.findIndex(row => row.id === pendingId || row.id === saved.id);
  const remaining = rows.filter(row => row.id !== pendingId && row.id !== saved.id);
  if (!stillVisible) return remaining;
  remaining.splice(position < 0 ? remaining.length : Math.min(position, remaining.length), 0, saved);
  return remaining;
}

/** Include a negative result for each requested ID; unavailable cards never refetch on render. */
export function sharedPostResults<T extends { id: string }>(ids: string[], rows: T[]): Map<string, T | null> {
  const results = new Map<string, T | null>(ids.map(id => [id, null]));
  for (const row of rows) if (results.has(row.id)) results.set(row.id, row);
  return results;
}
