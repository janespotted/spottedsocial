import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { PhoneInput, isValidNumber } from 'react-native-phone-entry';
import { Button, Spinner } from 'heroui-native';
import { useCSSVariable } from 'uniwind';
import { supabase } from '@/lib/supabase';

export default function PhoneScreen() {
  const [phone, setPhone] = useState('+1');
  const [countryCode, setCountryCode] = useState('US');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fieldBg, fieldFg, border] = useCSSVariable([
    '--color-field-background',
    '--color-foreground',
    '--color-border',
  ]) as [string, string, string];

  const valid = isValidNumber(phone, countryCode);

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    const normalized = phone.replace(/[^\d+]/g, '');
    const { error: err } = await supabase.auth.signInWithOtp({ phone: normalized });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.push({ pathname: '/auth/otp', params: { phone: normalized } });
  };

  return (
    <KeyboardAwareScrollView
      className="flex-1"
      contentContainerClassName="flex-grow justify-center px-6 gap-8"
      keyboardShouldPersistTaps="handled"
      bottomOffset={32}
    >
      <View className="gap-2">
        <Text className="text-foreground text-5xl font-extrabold tracking-tight">Spotted</Text>
        <Text className="text-muted text-lg">See where the night is happening.</Text>
      </View>

      <View className="gap-5">
        <View className="gap-2">
          <Text className="text-accent-soft text-sm font-medium">Phone number</Text>
          <PhoneInput
            defaultValues={{ countryCode: 'US', callingCode: '+1', phoneNumber: '+1' }}
            value={phone}
            onChangeText={setPhone}
            onChangeCountry={(country) => setCountryCode(country.cca2)}
            autoFocus
            theme={{
              enableDarkTheme: true,
              containerStyle: {
                backgroundColor: fieldBg,
                borderColor: border,
                borderWidth: 1,
                borderRadius: 16,
                height: 56,
                alignItems: 'center',
              },
              textInputStyle: { color: fieldFg, fontSize: 18 },
              codeTextStyle: { color: fieldFg, fontSize: 18 },
              flagButtonStyle: { marginLeft: 8 },
            }}
          />
          <Text className="text-muted-dark text-sm">
            We&apos;ll text you a one-time code.
          </Text>
        </View>

        <Button
          variant="primary"
          size="lg"
          isDisabled={busy || !valid}
          onPress={sendCode}
          className="bg-white active:bg-white/90"
        >
          {busy ? (
            <>
              <Spinner size="sm" color="#110a24" />
              <Button.Label className="text-background">Sending…</Button.Label>
            </>
          ) : (
            <Button.Label className="text-background">Send code</Button.Label>
          )}
        </Button>
      </View>

      {error ? (
        <Text selectable className="text-danger text-base">
          {error}
        </Text>
      ) : null}
    </KeyboardAwareScrollView>
  );
}
