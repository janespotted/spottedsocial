import { test } from '@e2e-dev/mobile';
import { expect } from 'e2e';
import { answerTonightIfAsked } from './tonight';

// A real NYC venue (`is_demo = false`). The test account's city must be NYC.
const VENUE = 'Temple Bar';

test('a venue can be saved and unsaved from its card', async ({ app, agent, screen }) => {
  await app.open();
  await answerTonightIfAsked(screen);

  await agent.act('open search, search for {venue}, and open its venue card', {
    params: { venue: VENUE },
  });
  await expect(screen.getByText(VENUE).first()).toBeVisible();

  // Save is labelled with its state. Flip it twice so the account ends as it
  // was found, whichever state that was.
  const save = screen.getByRole('button', 'Save to wishlist');
  const saved = screen.getByRole('button', 'Saved. Remove from wishlist');
  const state = async () => (await saved.count()) + (await save.count());
  await expect.poll(state).toBe(1);
  const [from, to] = (await saved.count()) > 0 ? [saved, save] : [save, saved];

  await from.tap();
  await expect(to).toBeVisible();

  await to.tap();
  await expect(from).toBeVisible();
});
