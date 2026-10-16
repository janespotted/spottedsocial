import { useSyncExternalStore } from 'react';
import { DemoSandbox, type DemoSeed } from './demo-sandbox';
import { getSessionUserId, onSessionIdentityChange, resetSessionDataScope, sessionFetch } from './session-identity';

let authorized = false;
let owner: string | null = null;
let sandbox: DemoSandbox | null = null;
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };
export function setDemoAuthorization(value: boolean): void {
  authorized = value; owner = getSessionUserId();
  if (!value && sandbox) { sandbox = null; resetSessionDataScope(); }
  emit();
}
onSessionIdentityChange(() => {
  if (owner !== getSessionUserId()) { authorized = false; owner = null; sandbox = null; emit(); }
});
// Deliberately off on every cold launch. No saved switch can activate fixtures.
export async function hydrateDemoMode(): Promise<void> {}
export async function setDemoMode(next: boolean, seed?: DemoSeed): Promise<void> {
  if (next && (!authorized || !owner || seed?.userId !== owner)) throw new Error('Admin access is required for demo data.');
  if (next === !!sandbox) return;
  sandbox = next ? new DemoSandbox(seed!) : null;
  resetSessionDataScope(); emit();
}
export function isDemoMode(): boolean { return authorized && !!sandbox && owner === getSessionUserId(); }
export function getDemoSandbox(): DemoSandbox | null { return isDemoMode() ? sandbox : null; }
export function useDemoMode(): boolean {
  return useSyncExternalStore(callback => { listeners.add(callback); return () => { listeners.delete(callback); }; }, isDemoMode);
}
/** Only authentication refresh and a read-only capability check can leave Demo.
 * Unknown tables, RPCs, storage and Edge Functions never reach production. */
export async function appFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const demo = getDemoSandbox();
  const control = url.pathname === '/rest/v1/rpc/get_launch_state';
  const refresh = url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token';
  if (demo && !control && !refresh) return sessionFetch(input, init, demo.fetch.bind(demo));
  // Late sample actions after leaving demo must never be sent to real people.
  if (!demo && /de000000-0000-4000-8000-/.test(url.href + (typeof init?.body === 'string' ? init.body : ''))) {
    return new Response(JSON.stringify({ code: 'DEMO_ENDED', message: 'Demo ended. Reopen the action to continue.' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  return sessionFetch(input, init);
}
