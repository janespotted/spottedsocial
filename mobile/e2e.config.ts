import type { E2EConfig } from 'e2e';
import { mobile } from '@e2e-dev/mobile';
import { mobileTools } from '@e2e-dev/mobile/tools';
import { chatgpt } from 'e2e/oauth/chatgpt';

// Drives the dev build installed on the simulator (`npx expo run:ios`), with
// Metro running. Override the simulator with E2E_IOS_DEVICE (name or UDID).
const iphone = mobile({
  platform: 'ios',
  device: process.env.E2E_IOS_DEVICE ?? 'iPhone 17 Pro Max',
});

export default {
  tests: 'e2e/**/*.e2e.ts',
  targets: [
    {
      name: 'ios',
      engine: iphone,
      app: { bundleId: 'com.janereynolds.spotted' },
    },
  ],
  workers: 1,
  // Agent steps run on the ChatGPT subscription: `npx e2e login openai` once.
  agents: {
    default: {
      model: chatgpt('gpt-6-luna'),
      tools: mobileTools(iphone),
      system: 'You are a thorough QA agent. Verify every outcome on screen.',
      context: [
        'Spotted is a nightlife app: friends share whether they are out tonight and where.',
        'Tabs along the bottom: Home (newsfeed), Leaderboard, Map, Chat (Plans | DMs), Profile (the S mark).',
        'The header pill on the right reads Status, Out, TBD or In and opens the "Are you out tonight?" check-in sheet.',
        'Sheets slide up from the bottom; swipe one down to dismiss it.',
      ].join('\n'),
    },
  },
} satisfies E2EConfig;
