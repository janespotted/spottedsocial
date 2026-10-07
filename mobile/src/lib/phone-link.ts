import { supabase } from './supabase';

/**
 * Adding (or changing) the phone number on the SIGNED-IN account — for Apple
 * users, who arrive with none, and for anyone changing theirs. Supabase texts
 * a code to the new number (`updateUser({ phone })`) and the number is only
 * set once that code is verified (`verifyOtp`, type "phone_change"), so it is
 * always a number the person really has. It lands on auth.users.phone: what
 * contact matching (match_contacts) and phone sign-in both use.
 */

/** The number already belongs to a different Spotted account. */
export class PhoneTakenError extends Error {
  constructor() {
    super(
      'this number already has a spotted account. sign in with your phone instead — then you can connect apple in settings → sign-in methods.'
    );
  }
}

export async function sendPhoneCode(e164: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ phone: e164 });
  if (!error) return;
  if (error.code === 'phone_exists' || /already (been )?registered|already exists/i.test(error.message)) {
    throw new PhoneTakenError();
  }
  throw error;
}

export async function confirmPhoneCode(e164: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ phone: e164, token: code.trim(), type: 'phone_change' });
  if (error) throw error;
}
