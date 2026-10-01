/** Staying In withholds automatic live-location previews. Explicit shares remain usable. */
export function withholdLivePreview(status: string | null | undefined, resolved = true): boolean {
  return !resolved || status === 'home';
}
export function liveActivityMessage(type: string, original: string, withheld: boolean): string {
  return withheld && ['friend_planning', 'friend_arrived_venue', 'friends_at_venue', 'friend_out', 'friend_arrived', 'friend_checkin', 'friend_nearby', 'close_friend_out', 'close_friend_checkin', 'venue_arrival', 'friend_at_venue'].includes(type)
    ? 'Updated their night. Live location previews are hidden while you are Staying In.' : original;
}
