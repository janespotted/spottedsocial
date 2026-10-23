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

test('Unified Home changes content at the boundary without a second feed segment', () => {
 const { extract } = require('./product-test-runtime.cjs');
 let isNight=false;
 const render=extract('app/(tabs)/(home)/index.tsx','HomeScreenContent',{
  require:()=>jsxRuntime,useNightMode:()=>({isNight,city:'nyc'}),useNotifications:()=>({unreadCount:0}),
  View:'View',HomeHeader:'Header',ModeCountdownStrip:'Clock',DayHome:'DayHome',NewsfeedScreen:'Feed',
 });
 for(const night of [false,true,false]){isNight=night;const tree=nodes(render());assert.equal(tree.filter(n=>n.type==='Clock').length,1);assert.equal(tree.some(n=>n.type==='Feed'),night);assert.equal(tree.some(n=>n.type==='DayHome'),!night);assert(!tree.some(n=>n.type==='Tabs'));}
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
