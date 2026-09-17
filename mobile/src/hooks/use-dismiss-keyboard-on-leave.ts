import { useCallback, useEffect } from 'react';
import { Keyboard } from 'react-native';
import { useFocusEffect, useNavigation } from 'expo-router';
import { KeyboardController } from 'react-native-keyboard-controller';

/**
 * Resigns the keyboard for real. RN's `Keyboard.dismiss()` only blurs the
 * input React believes is focused; when a native-stack screen is popped
 * with an input focused inside a keyboard-controller sticky view, that
 * bookkeeping is already gone and the keyboard stays pinned over the
 * previous screen. KeyboardController.dismiss() resigns the first
 * responder natively, whatever it is.
 */
export function dismissKeyboardNow(): void {
  Keyboard.dismiss();
  KeyboardController.dismiss({ keepFocus: false }).catch(() => {});
}

/**
 * Closes the keyboard when the screen is left — back button, swipe-back,
 * a sheet dismiss, or a tab change (addendum v3 §8.2). `beforeRemove`
 * fires while the input still exists, which is what makes the dismiss take.
 */
export function useDismissKeyboardOnLeave(): void {
  const navigation = useNavigation();
  useEffect(() => {
    const unsubRemove = navigation.addListener('beforeRemove', dismissKeyboardNow);
    const unsubBlur = navigation.addListener('blur', dismissKeyboardNow);
    return () => {
      unsubRemove();
      unsubBlur();
      dismissKeyboardNow();
    };
  }, [navigation]);
}

/**
 * For screens that have no text input of their own (tab lists): whatever
 * screen was just left, no keyboard belongs here. Belt and braces for the
 * hook above.
 */
export function useNoKeyboardOnFocus(): void {
  useFocusEffect(
    useCallback(() => {
      dismissKeyboardNow();
    }, [])
  );
}
