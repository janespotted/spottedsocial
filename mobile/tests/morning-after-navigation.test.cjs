const test = require('node:test');
const assert = require('node:assert/strict');
const { compile, source, load } = require('./product-test-runtime.cjs');

const jsx = (type, props) => ({ type, props });
const jsxRuntime = { jsx, jsxs: jsx };
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}

test('Home switches Day Morning After → Night feed → Day Morning After without leaving a recap overlay', () => {
  let isNight = false, cursor = 0, changed = false;
  const state = [];
  const useState = initial => {
    const index = cursor++;
    if (!(index in state)) state[index] = initial;
    return [state[index], value => { changed ||= state[index] !== value; state[index] = value; }];
  };
  const code = source('app/(tabs)/(home)/index.tsx').split('export default function HomeScreen()')[1].split('\ntype HomeTab')[0];
  const { render } = compile('export function render()' + code, {
    require: name => { assert.equal(name, 'react/jsx-runtime'); return jsxRuntime; },
    useState, useNightMode: () => ({ isNight, city: 'nyc' }), useNotifications: () => ({ unreadCount: 0 }),
    View: 'View', HomeHeader: 'Header', SubTabs: 'Tabs', DayHome: 'Recap',
    NewsfeedScreen: 'Feed', NightOpeningScreen: 'Opening',
  });
  const screen = () => {
    let tree;
    do { cursor = 0; changed = false; tree = render(); } while (changed);
    return nodes(tree);
  };
  let tree = screen();
  assert(tree.some(n => n.type === 'Recap'));
  assert(!tree.some(n => n.type === 'Feed'));
  tree.find(n => n.type === 'Tabs').props.onChange('feed');
  assert(screen().some(n => n.type === 'Opening'));
  isNight = true;
  tree = screen();
  assert(!tree.some(n => ['Tabs', 'Recap', 'Opening'].includes(n.type)));
  assert.equal(tree.find(n => n.type === 'Feed').props.active, true);
  isNight = false;
  tree = screen();
  assert(tree.some(n => n.type === 'Recap'));
  assert.equal(tree.find(n => n.type === 'Tabs').props.value, 'morning');
});

test('Profile exposes one accessible Morning After shortcut at night and opens the existing recap route', () => {
  let isNight = false;
  const routes = [];
  const mocks = {
    'react/jsx-runtime': jsxRuntime,
    react: { useState: value => [value, () => {}] },
    'react-native': { useWindowDimensions: () => ({ fontScale: 1 }), View: 'View', Text: 'Text', ScrollView: 'ScrollView', Pressable: 'Pressable' },
    'expo-router': { router: { push: route => routes.push(route) } },
    '@tanstack/react-query': { useQuery: () => ({}), useQueryClient: () => ({}) },
    uniwind: { useResolveClassNames: () => ({}) },
    '@/hooks/use-session': { useSession: () => ({ session: { user: { id: 'synthetic' } } }) },
    '@/hooks/use-notifications': { useNotifications: () => ({ unreadCount: 0 }) },
    '@/hooks/use-night-mode': { useNightMode: () => ({ isNight }) },
    '@/hooks/use-friend-request-count': { useFriendRequestCount: () => ({ data: 0 }) },
    '@/hooks/use-friend-ids': { useFriendIds: () => ({ data: [] }) },
    '@/hooks/use-own-night-status': { useOwnNightStatus: () => ({}) },
    '@/hooks/use-pull-to-refresh': { usePullToRefresh: () => ({}) },
    '@/lib/audience': { isAudience: () => false, DEFAULT_AUDIENCE: 'all_friends' },
    '@/lib/reset-copy': { RESET_COPY: {} },
  };
  const module = load('app/(tabs)/(profile)/profile.tsx', new Proxy(mocks, {
    has: () => true, get: (target, name) => target[name] ?? {},
  }));
  const shortcuts = () => nodes(module.default()).filter(n => n.props?.accessibilityLabel === 'Morning After');
  assert.equal(shortcuts().length, 0);
  isNight = true;
  const [link] = shortcuts();
  assert.equal(shortcuts().length, 1);
  assert.equal(link.props.accessibilityRole, 'button');
  link.props.onPress();
  assert.equal(routes[0], '/morning-after');
});
