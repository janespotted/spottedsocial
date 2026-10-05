export interface ConfirmationPerson { id: string; display_name: string; avatar_url: string | null }
export function parseConfirmationPeople(raw: unknown): ConfirmationPerson[] {
  try {
    const value: unknown = typeof raw === 'string' ? JSON.parse(raw) : null;
    if (!Array.isArray(value)) return [];
    return value.filter((p): p is ConfirmationPerson => !!p && typeof p.id === 'string' && !!p.id && typeof p.display_name === 'string' && !!p.display_name && (p.avatar_url === null || typeof p.avatar_url === 'string'));
  } catch { return []; }
}
export function parseNotificationIds(raw: unknown): string[] {
  try { const value: unknown = typeof raw === 'string' ? JSON.parse(raw) : null; return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)))] : []; }
  catch { return []; }
}
/** `{ friendId: threadId }` from the invite send, ids only. */
export function parseThreadIds(raw: unknown): Record<string, string> {
  try {
    const value: unknown = typeof raw === 'string' ? JSON.parse(raw) : null;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const uuid = /^[0-9a-f-]{36}$/i;
    return Object.fromEntries(Object.entries(value).filter((e): e is [string, string] => uuid.test(e[0]) && typeof e[1] === 'string' && uuid.test(e[1])));
  } catch { return {}; }
}
