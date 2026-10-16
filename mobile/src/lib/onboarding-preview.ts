import type { LaunchState } from './launch';

/** A preview never calls Auth, saves onboarding progress or uses the invite queue. */
export function previewLaunchState(): LaunchState {
  return { admitted: true, profileSaved: false, complete: false, hasPhone: true,
    cityTester: false, waveAdmin: false, phoneRequired: false, profile: null, nominations: [] };
}
export function previewLaunchAction(state: LaunchState, action: string, args: Record<string, unknown> = {}): LaunchState {
  switch (action) {
    case 'get_launch_state': return state;
    case 'save_launch_profile': {
      const name = String(args.p_name ?? '').trim(), username = String(args.p_username ?? '');
      if (!name || !/^[a-z0-9_.]{3,20}$/.test(username) || args.p_terms !== true) throw new Error('Enter your name, a valid username, and accept the terms.');
      return { ...state, profileSaved: true, profile: { name, username } };
    }
    case 'save_launch_nomination': {
      const slot = Number(args.p_slot), phone = String(args.p_phone ?? '');
      if (![1, 2].includes(slot) || !/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error('Enter a valid phone number.');
      if (state.nominations.some(n => n.slot !== slot && n.phone === phone)) throw new Error('Choose two different people.');
      return { ...state, nominations: [...state.nominations.filter(n => n.slot !== slot), { slot, phone, activated: false }] };
    }
    case 'complete_launch_onboarding':
      if (!state.profileSaved || state.nominations.length !== 2) throw new Error('Finish your profile and choose two people.');
      return { ...state, complete: true };
    default: throw new Error('This action is unavailable in onboarding preview.');
  }
}
