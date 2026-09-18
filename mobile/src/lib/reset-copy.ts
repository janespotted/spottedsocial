import { getCityLabel } from './city-neighborhoods';

/**
 * The 5AM Reset, in the client's own words (addendum v3 §3). One module so
 * every screen says the same thing: lowercase "5am", the city named only
 * where the user is setting their own status, and "disappear"/"clears" —
 * never "deleted", which the product cannot promise while the Morning After
 * recap is undecided (§5).
 */

/** The umbrella line. Onboarding, the status sheet footer, Settings. */
export const RESET_TITLE = 'Tonight resets at 5am.';

/** The full explanation — onboarding card and the Settings row. */
export const RESET_BODY =
  'Your live location, posts, Yaps, DMs, meetups and invites from tonight disappear at 5am. Your profile and friends stay. Tomorrow starts fresh.';

/** What survives, for the Settings detail. */
export const RESET_KEPT =
  'Your account, profile and photo, your friends and Close Friends, saved venues and your settings all stay.';

export const RESET_COPY = {
  /** Status sheet footer, under Yes / TBD / No. */
  statusFooter: RESET_TITLE,
  /** Yes → venue confirmation, near the share CTA. */
  venueConfirm: 'Your status + shared spot clear at 5am.',
  /** TBD sheet, under the supporting copy. */
  tbdStatus: 'Your TBD status clears at 5am.',
  /** Active status card on Map / Profile. */
  liveUntil: 'Live until 5am',
  sharedUntil: 'Shared until 5am',
  /** Friend card, under a friend's visible venue. */
  friendCard: 'Shared for tonight · clears at 5am.',
  /** Plans landing screen, a compact row under the header. */
  plansHeader: 'Tonight resets at 5am — meetups + invites disappear then.',
  /** Immediately above the final send in each composer. */
  meetupCompose: 'This meetup disappears at 5am.',
  inviteCompose: 'This invite disappears at 5am.',
  planCompose: 'This plan disappears at 5am.',
  /** Sent / received meetup + invite cards. */
  expiresAt: 'Expires at 5am',
  meetupSentToast: 'Meetup sent · expires at 5am',
  inviteSentToast: 'Invite sent · expires at 5am',
  /** Post preview, beside the audience row. */
  postPreview: 'Disappears at 5am.',
  /** Published feed card, with the post time. */
  feedCard: 'Tonight · until 5am',
  /** Yap venue feed. */
  yapFeed: "Tonight's Yap · clears at 5am",
  /** DM thread header. */
  dmThread: 'Tonight only · messages clear at 5am.',
  /** New / empty DM. */
  dmEmpty: 'Messages sent here clear at 5am.',
  /** Activity rows still live. */
  activityExpires: 'Expires 5am',
  /** Morning After entry. */
  morningAfter: 'Last night reset at 5am.',
  /** Settings row title. */
  settingsRow: '5AM Reset',
} as const;

/**
 * The one place the city is named: the user setting their own status is the
 * moment the zone matters ("5:00 AM New York time"), because a traveller's
 * night follows their profile city, not their phone.
 */
export function resetTimeWithCity(city: string | null | undefined): string {
  return `Statuses reset at 5:00 AM ${getCityLabel(city ?? 'nyc')} time`;
}
