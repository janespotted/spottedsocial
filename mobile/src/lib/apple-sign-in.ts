import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import type { UserIdentity } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * Sign in with Apple, natively: Apple's sheet returns an identity token and
 * Supabase verifies it (`signInWithIdToken`, provider "apple", the bundle id
 * as the client id). A new Apple user is a new account and goes through
 * onboarding like any other; the session listener does the redirect.
 *
 * The nonce: Apple signs the SHA-256 of a random value into the token and
 * Supabase is given the raw value to check it against, so a token lifted
 * from elsewhere can't be replayed here.
 */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  return AppleAuthentication.isAvailableAsync().catch(() => false);
}

/** Apple's sheet → its credential plus the raw nonce; null when the user closed it. */
async function getAppleCredential(): Promise<{
  credential: AppleAuthentication.AppleAuthenticationCredential;
  token: string;
  rawNonce: string;
} | null> {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'ERR_REQUEST_CANCELED') return null;
    // The native message ("RequestUnknownException … .swift:61") means
    // nothing to a person. "Unknown" is also what iOS reports when there is
    // no Apple Account on the device and they close its prompt.
    throw new Error(
      code === 'ERR_REQUEST_UNKNOWN'
        ? 'Couldn’t reach Apple. Make sure you’re signed in to your Apple Account in Settings, then try again.'
        : 'Apple sign-in didn’t finish. Please try again.'
    );
  }
  if (!credential.identityToken) throw new Error('Apple did not return a sign-in token. Please try again.');
  return { credential, token: credential.identityToken, rawNonce };
}

/** False when the user closed Apple's sheet; throws on a real failure. */
export async function signInWithApple(): Promise<boolean> {
  const apple = await getAppleCredential();
  if (!apple) return false;
  const { credential } = apple;

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: apple.token,
    nonce: apple.rawNonce,
  });
  if (error) {
    // Supabase's Apple provider is off, or the bundle id isn't in its client ids
    if (/provider|not enabled|unacceptable audience|audience/i.test(error.message))
      throw new Error('Apple sign-in isn’t available right now. Please use your phone number.');
    throw error;
  }

  // Apple shares the name ONLY on the first sign-in with this app, and it is
  // not in the token — keep it so onboarding can offer it as the name.
  const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ').trim();
  if (name) {
    await supabase.auth
      .updateUser({
        data: {
          full_name: name,
          given_name: credential.fullName?.givenName ?? null,
          family_name: credential.fullName?.familyName ?? null,
        },
      })
      .catch(() => {});
  }
  return true;
}

/**
 * Connect Apple to the SIGNED-IN account (Settings → Sign-in methods), so a
 * phone user can also sign in with Apple and reach the same account instead
 * of creating a second one. Needs "Manual linking" on in Supabase Auth.
 * False when the user closed Apple's sheet.
 */
export async function connectApple(): Promise<boolean> {
  const apple = await getAppleCredential();
  if (!apple) return false;
  const { error } = await supabase.auth.linkIdentity({
    provider: 'apple',
    token: apple.token,
    nonce: apple.rawNonce,
  });
  if (error) {
    if (/already (been )?linked|identity_already_exists|already exists/i.test(`${error.code} ${error.message}`))
      throw new Error(
        'This Apple ID already has its own Spotted account. Sign in with Apple to use it, or delete that account first.'
      );
    if (/manual linking/i.test(error.message))
      throw new Error('Connecting Apple isn’t switched on yet. Please try again later.');
    throw error;
  }
  return true;
}

/** Disconnect Apple; the caller makes sure another sign-in method remains. */
export async function disconnectApple(identity: UserIdentity): Promise<void> {
  const { error } = await supabase.auth.unlinkIdentity(identity);
  if (error) throw error;
}
