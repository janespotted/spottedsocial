import './entry.js';
const endpoint = 'https://rwavbyvdytdegntdryll.supabase.co/rest/v1/rpc/get_shared_venue_preview';
const publishableKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3YXZieXZkeXRkZWdudGRyeWxsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MjQ5NzksImV4cCI6MjA5MTIwMDk3OX0.5JNlNJ8HkEGvrfhDdsHzOWBSbUZm8V1hbfaY9Clpz94";
export function sharedVenueId(search) {
  const id = new URLSearchParams(search).get('venueId');
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
}
export function sharedVenueAppLink(search) {
  const id = sharedVenueId(search);
  if (!id) return null;
  const ref = (new URLSearchParams(search).get('ref') ?? '').toUpperCase();
  return 'spotted://venue-link?venueId=' + encodeURIComponent(id) + (/^[A-HJ-NP-Z2-9]{8}$/.test(ref) ? '&ref=' + ref : '');
}
export async function getSharedVenue(id, transport = fetch, signal) {
  if (!sharedVenueId('?venueId=' + encodeURIComponent(id))) return null;
  const response = await transport(endpoint, {method:'POST',headers:{apikey:publishableKey,'Content-Type':'application/json'},body:JSON.stringify({p_venue_id:id}),signal});
  if (!response.ok) throw new Error('Couldn’t load this spot.');
  const value = await response.json();
  if (!value || value.id !== id || typeof value.name !== 'string') return null;
  return {id:value.id,name:value.name,neighborhood:value.neighborhood,city:value.city,type:value.type};
}
if (typeof document !== 'undefined') {
  const title = document.getElementById('venue-name'), detail = document.getElementById('venue-detail');
  const retry = document.getElementById('venue-retry'), open = document.getElementById('open-venue');
  const id = sharedVenueId(location.search);
  let loading = false;
  async function load() {
    if (loading) return;
    loading = true; retry.hidden = true; open.hidden = true;
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(),15000);
    try {
      const venue = id ? await getSharedVenue(id,fetch,controller.signal) : null;
      if (!venue) { title.textContent='This spot is unavailable.';detail.textContent='Ask your friend for a new link. You can still request access to Spotted.';return; }
      title.textContent=venue.name;
      const city = {nyc:'New York',la:'Los Angeles'}[venue.city] ?? venue.city;
      detail.textContent=[venue.neighborhood,city].filter(x=>typeof x==='string' && x).join(' · ');
      open.href=sharedVenueAppLink(location.search);open.hidden=false;
    } catch {detail.textContent='Couldn’t load this spot. Check your connection and try again.';retry.hidden=false;}
    finally {clearTimeout(timeout);loading=false;}
  }
  retry.addEventListener('click',load);void load();
}
