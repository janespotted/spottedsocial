import { expect } from 'e2e';
import type { Screen } from 'e2e';

/**
 * The opening "Are you out tonight?" sheet is a required answer (no swipe
 * dismiss) until a status exists for tonight, so every test that needs the
 * app underneath goes through here first.
 *
 * Answers "Staying in": it writes a `home` row friends never see, and it
 * holds until the city's 5 AM reset, so later tests skip the sheet.
 */
export async function answerTonightIfAsked(screen: Screen): Promise<void> {
  const gate = screen.getByText('Are you out tonight?');
  const answered = screen.getByRole('button', /^Update status\. Tonight:/);
  const state = async () =>
    (await gate.count()) > 0 ? 'asked' : (await answered.count()) > 0 ? 'answered' : 'loading';

  await expect.poll(state, { timeout: 20_000 }).not.toBe('loading');
  if ((await state()) === 'answered') return;

  await screen.getByText('Staying in').tap();
  await screen.getByText('Set as staying in').tap();
  await expect(answered).toBeVisible();
}
