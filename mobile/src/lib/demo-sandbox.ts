import { getNightKey, getNightResetIso } from './tonight';

// This store is deliberately memory-only. It never contains real friends or
// credentials and is discarded when demo ends or the signed-in account changes.
type Row = Record<string, any>;
export interface DemoSeed { userId: string; name: string; username: string; city: string }
export const demoId = (n: number) => `de000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export class DemoSandbox {
  readonly tables: Record<string, Row[]> = {};
  mode: 'auto' | 'day' | 'night' = 'night';
  private sequence = 1000;
  private listeners = new Set<() => void>();
  constructor(readonly seed: DemoSeed) { this.reset(); }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private changed() { for (const listener of this.listeners) listener(); }
  private id() { return demoId(++this.sequence); }
  private now() { return new Date().toISOString(); }
  private expires() { return getNightResetIso(this.seed.city); }
  private row(table: string, value: Row): Row {
    const row = { id: this.id(), created_at: this.now(), ...value };
    (this.tables[table] ??= []).push(row); return row;
  }
  reset() {
    for (const key of Object.keys(this.tables)) delete this.tables[key];
    this.mode = 'night'; this.sequence = 1000;
    const { userId, city } = this.seed;
    const names = ['Alex Demo', 'Sam Demo', 'Jordan Demo', 'Riley Demo'];
    const spots = city === 'la'
      ? [['The Echo', 'Echo Park', 34.0775, -118.2607], ['Sound', 'Hollywood', 34.1002, -118.3297], ['Academy LA', 'Hollywood', 34.1023, -118.3226]]
      : city === 'lhr' ? [['Demo Rooftop', 'Gulberg', 31.5204, 74.3587], ['Demo Garden', 'DHA', 31.477, 74.386], ['Demo Social', 'Gulberg', 31.510, 74.349]]
      : [['Gospel', 'SoHo', 40.7213, -73.9966], ['Public Records', 'Brooklyn', 40.6827, -73.9867], ['Nowadays', 'Queens', 40.7096, -73.9015]];
    spots.forEach(([name, neighborhood, lat, lng], i) => this.row('venues', {
      id: demoId(10 + i), name, neighborhood, lat, lng, city, is_demo: false,
      venue_type: 'nightclub', category: 'nightclub', popularity_rank: i + 1, popularity_score: 95 - i * 8,
      address: 'Sample venue · demo data', image_url: null, google_rating: null,
      rating: null, price_level: null, opening_hours: null, description: null, website: null,
    }));
    const profiles = [{ id: userId, display_name: `${this.seed.name || 'You'} · Demo`, username: this.seed.username || 'you' }, ...names.map((name, i) => ({ id: demoId(i + 1), display_name: name, username: name.toLowerCase().replace(' ', '_') }))];
    profiles.forEach((p, i) => this.row('profiles', {
      ...p, avatar_url: null, city, is_demo: true, is_out: i < 3, push_enabled: false,
      show_read_receipts: true, location_sharing_level: 'all_friends',
      last_known_lat: i < 3 ? spots[i % 3][2] : null, last_known_lng: i < 3 ? spots[i % 3][3] : null,
      last_location_at: this.now(), bio: 'Sample profile. Only visible in your demo.',
    }));
    profiles.forEach((p, i) => this.row('night_statuses', {
      user_id: p.id, status: i < 3 ? 'out' : 'planning', venue_id: i < 3 ? demoId(10 + i % 3) : null,
      venue_name: i < 3 ? spots[i % 3][0] : null, lat: i < 3 ? spots[i % 3][2] : null, lng: i < 3 ? spots[i % 3][3] : null,
      planning_visibility: 'all_friends', planning_neighborhood: i >= 3 ? spots[0][1] : null,
      is_demo: true, is_private_party: false, automatic_venue_updates: false,
      manual_venue_until: null, party_neighborhood: null, updated_at: this.now(), expires_at: this.expires(),
    }));
    profiles.slice(1).forEach((p, i) => {
      this.row('friendships', { user_id: userId, friend_id: p.id, status: 'accepted' });
      if (i === 0) this.row('close_friends', { user_id: userId, close_friend_id: p.id });
      this.row('posts', { id: demoId(30 + i), user_id: p.id, text: ['Found our spot for tonight.', 'Who’s joining us?', 'One more stop?', 'See you on the dance floor.'][i], image_url: null,
        media_type: null, mux_playback_id: null, venue_id: demoId(10 + i % 3), venue_name: spots[i % 3][0], visibility: 'all_friends',
        is_demo: true, likes_count: 0, comments_count: 0, expires_at: this.expires() });
      if (i < 2) this.row('plans', { id: demoId(40 + i), user_id: p.id, venue_id: demoId(10 + i), venue_name: spots[i][0],
        plan_date: getNightKey(new Date(), city), plan_time: i === 0 ? '21:30' : '22:00', plan_type: 'party',
        description: null, visibility: 'all_friends', score: 3 - i, comments_count: 0, is_demo: true, expires_at: this.expires() });
    });
    this.row('plan_participants', { plan_id: demoId(40), user_id: demoId(2) });
    this.row('plan_downs', { plan_id: demoId(40), user_id: demoId(3) });
    this.row('wishlist_places', { user_id: userId, venue_id: demoId(11), venue_name: spots[1][0] });
    this.row('checkins', { user_id: userId, venue_id: demoId(10), venue_name: spots[0][0], started_at: this.now(), ended_at: null });
    const thread = this.thread(demoId(1));
    this.row('dm_messages', { thread_id: thread, sender_id: demoId(1), text: 'Ready when you are. Try sending a message here.', image_url: null });
    const request = this.invite(demoId(2), userId, 'venue', demoId(11));
    this.row('notifications', { receiver_id: userId, sender_id: demoId(2), type: 'venue_invite', message: `Sam invited you to ${spots[1][0]}. Want to go?`, is_read: false,
      data: { invite_id: request.id, thread_id: request.thread_id, venue_id: demoId(11), status: 'pending' } });
    this.changed();
  }
  private thread(peer: string): string {
    const mine = this.tables.dm_thread_members?.filter(m => m.user_id === this.seed.userId).map(m => m.thread_id) ?? [];
    const existing = this.tables.dm_thread_members?.find(m => m.user_id === peer && mine.includes(m.thread_id));
    if (existing) return existing.thread_id;
    const t = this.row('dm_threads', { is_group: false, name: null, group_avatar_url: null });
    for (const user_id of [this.seed.userId, peer]) this.row('dm_thread_members', { thread_id: t.id, user_id });
    return t.id;
  }
  private invite(sender: string, receiver: string, kind: string, venueId?: string) {
    const venue = this.tables.venues.find(v => v.id === venueId);
    const thread_id = this.thread(sender === this.seed.userId ? receiver : sender);
    const id = this.id();
    const msg = this.row('dm_messages', { thread_id, sender_id: sender, text: `[${kind === 'venue' ? 'invite' : 'meetup'}:${id}]`, image_url: null });
    return this.row('invites', { id, kind, sender_id: sender, receiver_id: receiver, thread_id, message_id: msg.id,
      venue_id: venue?.id ?? null, venue_name: venue?.name ?? null, status: 'pending', responded_at: null, expires_at: this.expires() });
  }
  private participates() { return ['out', 'planning'].includes(this.tables.night_statuses.find(r => r.user_id === this.seed.userId)?.status); }
  private rpc(name: string, p: Row): unknown {
    const me = this.seed.userId;
    switch (name) {
      case 'get_profiles_safe': return this.tables.profiles.map(r => this.participates() || r.id === me ? r : { ...r, is_out: false, last_known_lat: null, last_known_lng: null, last_location_at: null });
      case 'get_own_night_status': return this.tables.night_statuses.filter(r => r.user_id === me);
      case 'get_friends_night_counts': return { out: 2, planning: 2 };
      case 'get_night_mode': return { tester: true, enforced: true, override: this.mode === 'auto' ? null : this.mode };
      case 'set_night_mode_override':
        if (!['auto', 'day', 'night'].includes(p.p_mode)) throw new Error('Invalid mode');
        this.mode = p.p_mode; return this.rpc('get_night_mode', {});
      case 'commit_night_status': {
        const old = this.tables.night_statuses.find(r => r.user_id === me)!;
        if (this.mode === 'day' && ['out', 'planning', 'off'].includes(p.p_patch.status)) throw new Error('Switch to Night in Admin Testing to try this.');
        Object.assign(old, p.p_patch, { user_id: me, updated_at: this.now(), expires_at: this.expires(), automatic_venue_updates: false });
        const venue = this.tables.venues.find(v => v.id === old.venue_id);
        Object.assign(old, { lat: old.status === 'out' ? venue?.lat ?? null : null, lng: old.status === 'out' ? venue?.lng ?? null : null });
        Object.assign(this.tables.profiles[0], { is_out: old.status === 'out', last_known_lat: old.lat, last_known_lng: old.lng });
        return { gps_shared: false };
      }
      case 'get_mutual_friend_ids': case 'get_mutual_friends_with': return [];
      case 'get_demo_status_locations': return this.participates() ? this.tables.night_statuses.filter(r => r.status === 'out').map(r => ({ user_id: r.user_id, lat: r.lat, lng: r.lng })) : [];
      case 'get_recent_venue_visits': return this.tables.profiles.slice(1, 3).map((r, i) => ({ user_id: r.id, friend_id: r.id, venue_id: demoId(10 + i), display_name: r.display_name, avatar_url: null, visited_at: this.now(), last_visited_at: this.now(), expires_at: new Date(Date.now() + 90 * 86400000).toISOString() }));
      case 'get_night_recap': return { id: demoId(99), night_date: getNightKey(new Date(), this.seed.city), expires_at: this.expires(), photos: [],
        stops: this.tables.venues.slice(0, 2).map(v => ({ venue_id: v.id, venue_name: v.name, neighborhood: v.neighborhood, arrived_at: this.now(), left_at: null })),
        people: [{ friend_id: demoId(1), display_name: 'Alex Demo', avatar_url: null, venue_id: demoId(10), venue_name: this.tables.venues[0].name }] };
      case 'build_my_recap_now': return true;
      case 'create_dm_thread': return this.thread(p.friend_id);
      case 'send_dm_once': {
        const existing = this.tables.dm_messages?.find(r => r.id === p.p_id);
        return [existing ?? this.row('dm_messages', { id: p.p_id, thread_id: p.p_thread, sender_id: me, text: p.p_text, image_url: p.p_image ?? null })];
      }
      case 'send_meetup': {
        const r = this.invite(me, p.p_receiver, 'meetup'); return [{ result: 'sent', invite_id: r.id, thread_id: r.thread_id }];
      }
      case 'send_venue_invites': return (p.p_receivers as string[]).map(receiver => { const r = this.invite(me, receiver, 'venue', p.p_venue_id); return { created: true, receiver_id: receiver, invite_id: r.id, thread_id: r.thread_id }; });
      case 'respond_to_invite': {
        const r = this.tables.invites.find(r => r.id === p.p_invite && r.receiver_id === me);
        if (!r) throw new Error('Demo invitation unavailable');
        r.status = p.p_accept ? 'accepted' : 'declined'; r.responded_at = this.now();
        this.tables.notifications.forEach(n => { if (n.data?.invite_id === r.id) n.data.status = r.status; });
        return r;
      }
      case 'withdraw_invites': { const ids: string[] = p.p_ids; const matches = this.tables.invites.filter(r => ids.includes(r.id) && r.sender_id === me && r.status === 'pending'); this.tables.invites = this.tables.invites.filter(r => !matches.includes(r)); this.tables.dm_messages = this.tables.dm_messages.filter(m => !matches.some(r => r.message_id === m.id)); return matches.length; }
      case 'get_post_share_recipients': return this.tables.profiles.slice(1);
      case 'share_post_to_dm': { const thread = this.thread(p.p_recipient); this.row('dm_messages', { thread_id: thread, sender_id: me, text: `[shared_post:${p.p_post}]`, image_url: null }); return thread; }
      case 'save_plan': {
        const v = this.tables.venues.find(v => v.id === p.p_values.venue_id);
        if (!v) throw new Error('Choose a sample venue.');
        const previous = p.p_id ? this.tables.plans.find(r => r.id === p.p_id && r.user_id === me) : null;
        if (p.p_id && !previous) throw new Error('Only your own demo plans can be edited.');
        const fields = { ...p.p_values, venue_name: v.name, user_id: me, score: previous?.score ?? 0, comments_count: 0, is_demo: true, expires_at: this.expires() };
        const plan = previous ? Object.assign(previous, fields) : this.row('plans', fields);
        this.tables.plan_participants = (this.tables.plan_participants ?? []).filter(r => r.plan_id !== plan.id);
        for (const user_id of p.p_participants ?? []) this.row('plan_participants', { plan_id: plan.id, user_id });
        return plan.id;
      }
      case 'username_available': return true;
      case 'get_party_invite_recipients': return this.tables.profiles.slice(1);
      case 'approved_party_address': return null;
      default: throw new Error('This action needs live data. Exit Demo in Settings to use it.');
    }
  }
  /** All data traffic stays here. Unknown actions fail closed, never fall through. */
  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body || '{}') : {};
    const reply = (data: unknown, status = 200, count?: number) => new Response(method === 'HEAD' ? null : JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...(count !== undefined ? { 'content-range': `0-${Math.max(0, count - 1)}/${count}` } : {}) } });
    try {
      if (!url.pathname.startsWith('/rest/v1/')) throw new Error('Uploads and external services are unavailable in Demo. Your real account is unchanged.');
      const path = url.pathname.slice('/rest/v1/'.length);
      let data: unknown;
      if (path.startsWith('rpc/')) data = this.rpc(path.slice(4), body);
      else {
        const table = path;
        const all = this.tables[table] ??= [];
        let rows = all.filter(row => matches(row, url.searchParams));
        // Reproduce the No/TBD/Out presentation boundary using sample people.
        if (table === 'night_statuses' && !this.participates()) rows = rows.filter(r => r.user_id === this.seed.userId);
        if (method === 'POST') {
          const keys = (url.searchParams.get('on_conflict') ?? 'id').split(',');
          rows = (Array.isArray(body) ? body : [body]).map(value => {
            const old = headers.get('prefer')?.includes('resolution=merge-duplicates') ? all.find(r => keys.every(k => value[k] !== undefined && r[k] === value[k])) : null;
            if (old) { Object.assign(old, value); return old; }
            return this.row(table, { expires_at: this.expires(), is_demo: true, likes_count: 0, comments_count: 0, score: 0, ...value });
          });
        } else if (method === 'PATCH') rows.forEach(r => Object.assign(r, body));
        else if (method === 'DELETE') this.tables[table] = all.filter(r => !rows.includes(r));
        const order = url.searchParams.get('order')?.split(',') ?? [];
        rows = [...rows].sort((a, b) => {
          for (const expression of order) { const [key, dir] = expression.split('.'); const comparison = a[key] === b[key] ? 0 : a[key] > b[key] ? 1 : -1; if (comparison) return dir === 'desc' ? -comparison : comparison; } return 0;
        });
        const count = rows.length;
        const offset = Number(url.searchParams.get('offset') ?? 0), limit = Number(url.searchParams.get('limit') ?? 1000);
        rows = rows.slice(offset, offset + limit);
        if (!['GET', 'HEAD'].includes(method)) this.changed();
        if (headers.get('accept')?.includes('vnd.pgrst.object')) {
          if (rows.length !== 1) return reply({ code: 'PGRST116', message: `JSON object requested, ${rows.length} rows returned`, details: `The result contains ${rows.length} rows` }, 406);
          return reply(rows[0], 200, count);
        }
        return reply(rows, 200, count);
      }
      if (!['GET', 'HEAD'].includes(method) && !path.startsWith('rpc/get_')) this.changed();
      if (headers.get('accept')?.includes('vnd.pgrst.object') && Array.isArray(data)) return data.length === 1 ? reply(data[0]) : reply({ code: 'PGRST116', message: 'No row', details: 'The result contains 0 rows' }, 406);
      return reply(data);
    } catch (error) { return reply({ code: 'DEMO_ONLY', message: error instanceof Error ? error.message : 'Demo action unavailable' }, 400); }
  }
}

function split(expression: string): string[] {
  let depth = 0, current = ''; const parts: string[] = [];
  for (const char of expression) { if (char === '(') depth++; if (char === ')') depth--; if (char === ',' && depth === 0) { parts.push(current); current = ''; } else current += char; }
  if (current) parts.push(current); return parts;
}
function clause(row: Row, key: string, expression: string): boolean {
  if (key === 'or' || key === 'and') {
    const tests = split(expression.replace(/^\(|\)$/g, '')).map(part => {
      if (part.startsWith('and(') || part.startsWith('or(')) return clause(row, part.slice(0, part.indexOf('(')), part.slice(part.indexOf('(')));
      const dot = part.indexOf('.'); return clause(row, part.slice(0, dot), part.slice(dot + 1));
    }); return key === 'or' ? tests.some(Boolean) : tests.every(Boolean);
  }
  if (expression.startsWith('not.')) return !clause(row, key, expression.slice(4));
  const dot = expression.indexOf('.'), op = expression.slice(0, dot), value = expression.slice(dot + 1), raw = row[key];
  const str = raw === null || raw === undefined ? 'null' : String(raw);
  switch (op) {
    case 'eq': case 'is': return str === value;
    case 'neq': return str !== value;
    case 'in': return split(value.replace(/^\(|\)$/g, '')).map(v => v.replace(/^"|"$/g, '')).includes(str);
    case 'gt': return str !== 'null' && str > value;
    case 'gte': return str !== 'null' && str >= value;
    case 'lt': return str !== 'null' && str < value;
    case 'lte': return str !== 'null' && str <= value;
    case 'ilike': return str.toLowerCase().includes(value.replace(/[%*]/g, '').toLowerCase());
    default: return false;
  }
}
function matches(row: Row, params: URLSearchParams): boolean {
  return [...params].every(([key, value]) => ['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(key) || clause(row, key, value));
}
