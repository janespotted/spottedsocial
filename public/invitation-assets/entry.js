// Public publishable key; this RPC exposes only the configured installation URL.
const endpoint = "https://rwavbyvdytdegntdryll.supabase.co/rest/v1/rpc/get_launch_installation";
const publishableKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3YXZieXZkeXRkZWdudGRyeWxsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MjQ5NzksImV4cCI6MjA5MTIwMDk3OX0.5JNlNJ8HkEGvrfhDdsHzOWBSbUZm8V1hbfaY9Clpz94";
export function installationLink(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    if (url.hostname === 'apps.apple.com') return {url:value,label:'Download on the App Store'};
    if (url.hostname === 'testflight.apple.com' && /^\/(join|j)\/[a-zA-Z0-9]+$/.test(url.pathname)) return {url:value,label:'Get Spotted on TestFlight'};
  } catch {}
  return null;
}
export async function getInstallation(transport = fetch, signal) {
  const response = await transport(endpoint, {method:'POST',headers:{apikey:publishableKey,'Content-Type':'application/json'},body:'{}',signal});
  if (!response.ok) throw new Error('Download unavailable');
  return installationLink((await response.json())?.installUrl);
}
if (typeof document !== 'undefined') {
  const status = document.getElementById('download-status');
  const download = document.getElementById('download');
  const retry = document.getElementById('retry');
  let loading = false;
  async function load() {
    if (loading) return;
    loading = true; retry.hidden = true; download.hidden = true;
    status.textContent = 'Finding your download…'; status.hidden = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const link = await getInstallation(fetch, controller.signal);
      if (link) { download.href = link.url; download.textContent = link.label; download.hidden = false; status.hidden = true; }
      else status.textContent = 'Downloads are opening soon. Your invitation will tell you when it’s time.';
    } catch { status.textContent = 'Couldn’t load the download link.'; retry.hidden = false; }
    finally { clearTimeout(timeout); loading = false; }
  }
  retry.addEventListener('click',load);
  void load();
}
