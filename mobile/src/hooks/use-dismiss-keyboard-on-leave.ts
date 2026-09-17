import { useEffect } from 'react';
import { Keyboard } from 'react-native';
import { useNavigation } from 'expo-router';

/**
 * Closes the keyboard when the screen is left — back button, swipe-back,
 * a sheet dismiss, or a tab change (addendum v3 §8.2). Native-stack pops
 * do not resign the first responder reliably when the focused input is
 * inside a keyboard-controller sticky view, so the keyboard stayed pinned
 * over the previous screen. `beforeRemove` fires while the input still
 * exists, which is what makes the dismiss take.
 */
export function useDismissKeyboardOnLeave(): void {
  const navigation = useNavigation();
  useEffect(() => {
    const dismiss = () => Keyboard.dismiss();
    const unsubRemove = navigation.addListener('beforeRemove', dismiss);
    const unsubBlur = navigation.addListener('blur', dismiss);
    return () => {
      unsubRemove();
      unsubBlur();
      Keyboard.dismiss();
    };
  }, [navigation]);
}
