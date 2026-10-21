import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { appFetch, getDemoSandbox } from './demo-mode';
import { sessionFetch } from './session-identity';
import { timedFetch } from './telemetry-core';
import type { DemoSandbox } from './demo-sandbox';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
export const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const liveClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  global: { fetch: timedFetch(appFetch) },
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// Bind each demo query builder to its original sandbox. A token lookup or
// queued request finishing after Exit can never turn a sample write into a live one.
let demoClient: { store: DemoSandbox; client: typeof liveClient } | null = null;
export const supabase: typeof liveClient = new Proxy(liveClient, {
  get(target, property) {
    const store = getDemoSandbox();
    if (store && ['from', 'rpc', 'storage', 'functions'].includes(String(property))) {
      if (demoClient?.store !== store) demoClient = { store, client: createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: (input, init) => sessionFetch(input, init, async (url, options) => {
          if (getDemoSandbox() !== store) throw new Error('Demo ended. Reopen the action to continue.');
          return store.fetch(url, options);
        }) },
      }) };
      const client = demoClient.client;
      if (property === 'rpc') return (name: string, ...args: unknown[]) => Reflect.apply(
        name === 'get_launch_state' ? target.rpc : client.rpc,
        name === 'get_launch_state' ? target : client, [name, ...args]);
      const value = Reflect.get(client, property);
      return typeof value === 'function' ? value.bind(client) : value;
    }
    if (!store) demoClient = null;
    const value = Reflect.get(target, property);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});

// React Native REQUIREMENT (Supabase Expo docs): the token refresher must be
// driven from AppState — without this the ~1h access token silently expires
// while the app runs and every query starts failing until a cold relaunch.
supabase.auth.startAutoRefresh();
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
