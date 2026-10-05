import { test } from '@e2e-dev/mobile';
import { expect } from 'e2e';

// No model needed: the app launches and paints its first screen, signed in
// (the tab bar) or signed out (the phone sign-in).
test('app launches', async ({ app, screen }) => {
  await app.open();
  await expect(screen.getByText('Spotted').first()).toBeVisible();
});
