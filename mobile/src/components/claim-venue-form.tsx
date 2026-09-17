import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { NEON } from '@/lib/theme';
import { useSession } from '@/hooks/use-session';

const PRIMARY = 'hsl(270, 100%, 65%)';

interface Venue {
  id: string;
  name: string;
  neighborhood: string;
  city: string | null;
}

export function ClaimVenueForm() {
  const { session } = useSession();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Venue[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [businessEmail, setBusinessEmail] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (searchQuery.trim().length < 2) return;
    setSearching(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('venues')
      .select('id, name, neighborhood, city')
      .ilike('name', `%${searchQuery}%`)
      .limit(10);
    setSearching(false);
    if (err) {
      setError('Failed to search venues');
      return;
    }
    setSearchResults(data ?? []);
  };

  const handleSubmit = async () => {
    if (!session || !selectedVenue || !businessEmail) {
      setError('Please fill in all required fields');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase.from('venue_claim_requests').insert({
      user_id: session.user.id,
      venue_id: selectedVenue.id,
      venue_name: selectedVenue.name,
      business_email: businessEmail,
      business_phone: businessPhone || null,
      verification_notes: notes || null,
    });
    setSubmitting(false);
    if (err) {
      setError(
        err.code === '23505'
          ? 'You already have a pending claim for this venue'
          : 'Failed to submit claim request'
      );
      return;
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <View className="bg-white/5 border border-white/10 rounded-xl py-8 px-4 items-center">
        <SymbolView name="checkmark.circle" size={48} tintColor={NEON} />
        <Text className="text-white font-sans-semibold text-lg mt-4 mb-2">Claim Submitted!</Text>
        <Text className="text-white/60 text-sm font-sans text-center">
          We&apos;ll review your claim and get back to you within 24-48 hours.
        </Text>
      </View>
    );
  }

  return (
    <View className="bg-white/5 border border-white/10 rounded-xl p-4 gap-4">
      <Text className="text-white text-lg font-sans-semibold">Claim Your Venue</Text>

      {!selectedVenue ? (
        <>
          <View className="flex-row gap-2">
            <View className="flex-1 flex-row items-center bg-white/5 border border-white/20 rounded-md px-3">
              <SymbolView name="magnifyingglass" size={16} tintColor="rgba(255,255,255,0.5)" />
              <TextInput
                placeholder="Search for your venue..."
                placeholderTextColorClassName="accent-white/40"
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
                className="flex-1 h-10 pl-2 py-0 text-[15px] text-white font-sans"
              />
            </View>
            <Pressable
              onPress={handleSearch}
              disabled={searching || searchQuery.length < 2}
              className="h-10 px-4 rounded-md items-center justify-center active:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: PRIMARY }}
            >
              {searching ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text className="text-white font-sans-medium">Search</Text>
              )}
            </Pressable>
          </View>

          {searchResults.map((venue) => (
            <Pressable
              key={venue.id}
              onPress={() => setSelectedVenue(venue)}
              className="flex-row items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10 active:bg-white/10"
            >
              <SymbolView name="mappin" size={16} tintColor={PRIMARY} />
              <View>
                <Text className="text-white font-sans-medium">{venue.name}</Text>
                <Text className="text-white/50 text-xs font-sans">
                  {venue.neighborhood} • {venue.city?.toUpperCase()}
                </Text>
              </View>
            </Pressable>
          ))}

          {searchQuery.length >= 2 && searchResults.length === 0 && !searching ? (
            <Text className="text-white/50 text-sm font-sans text-center py-4">
              No venues found. Contact us to add your venue.
            </Text>
          ) : null}
        </>
      ) : (
        <>
          <View
            className="flex-row items-center justify-between p-3 rounded-lg border"
            style={{
              backgroundColor: 'rgba(166, 77, 255, 0.2)',
              borderColor: 'rgba(166, 77, 255, 0.3)',
            }}
          >
            <View className="flex-row items-center gap-3">
              <SymbolView name="mappin" size={16} tintColor={PRIMARY} />
              <View>
                <Text className="text-white font-sans-medium">{selectedVenue.name}</Text>
                <Text className="text-white/50 text-xs font-sans">
                  {selectedVenue.neighborhood}
                </Text>
              </View>
            </View>
            <Pressable onPress={() => setSelectedVenue(null)} hitSlop={8}>
              <Text className="text-white/60 text-sm font-sans">Change</Text>
            </Pressable>
          </View>

          <View className="gap-3">
            <View>
              <Text className="text-white/60 text-sm font-sans mb-1">Business Email *</Text>
              <TextInput
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="contact@yourvenue.com"
                placeholderTextColorClassName="accent-white/40"
                value={businessEmail}
                onChangeText={setBusinessEmail}
                className="h-10 rounded-md bg-white/5 border border-white/20 px-3 py-0 text-[15px] text-white font-sans"
              />
            </View>
            <View>
              <Text className="text-white/60 text-sm font-sans mb-1">
                Business Phone (optional)
              </Text>
              <TextInput
                keyboardType="phone-pad"
                placeholder="(555) 123-4567"
                placeholderTextColorClassName="accent-white/40"
                value={businessPhone}
                onChangeText={setBusinessPhone}
                className="h-10 rounded-md bg-white/5 border border-white/20 px-3 py-0 text-[15px] text-white font-sans"
              />
            </View>
            <View>
              <Text className="text-white/60 text-sm font-sans mb-1">
                Additional Notes (optional)
              </Text>
              <TextInput
                multiline
                placeholder="Any additional info to help verify ownership..."
                placeholderTextColorClassName="accent-white/40"
                value={notes}
                onChangeText={setNotes}
                className="min-h-20 rounded-md bg-white/5 border border-white/20 px-3 py-2 text-white font-sans"
              />
            </View>
          </View>

          <Pressable
            onPress={handleSubmit}
            disabled={submitting || !businessEmail}
            className="w-full h-10 rounded-md items-center justify-center active:opacity-80 disabled:opacity-50"
            style={{ backgroundColor: PRIMARY }}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text className="text-white font-sans-medium">Submit Claim Request</Text>
            )}
          </Pressable>
        </>
      )}

      {error ? (
        <Text selectable className="text-sm text-red-400 font-sans">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
