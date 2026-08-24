import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Platform, Image, Alert, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, User, Settings, ChevronRight, HelpCircle, Shield, CalendarClock, ImageIcon, Activity } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { File, Directory, Paths } from 'expo-file-system';
import { useSettingsStore, useTextScaleSubscription, useTheme } from '@/lib/settings';
import { remoteLog, setRemoteLogUser } from '@/lib/remoteLog';
import { useUnlockState, useRestoreSubscription } from '@/lib/purchases';
import { STORE_SETTINGS } from '@/lib/storePlatform';

interface UserProfile {
  name: string;
  screenName: string;
  dateOfBirth: string | null;
  dobVisible: boolean;
  gender: 'male' | 'female' | null;
  photoUri: string | null;
  memberSince: string | null;
}

const PROFILE_STORAGE_KEY = 'user-profile';
// Photos are copied into this permanent folder inside the app's document
// directory so they survive app updates (the image picker hands back a path
// in a temporary/cache folder that iOS wipes during an update).
const PROFILE_PHOTO_DIR = 'profile-photos';

// Copies a picked/captured image into permanent storage and returns the new
// persistent uri. Falls back to the original uri if the copy fails so the
// user still sees their photo for this session.
async function persistProfilePhoto(sourceUri: string): Promise<string> {
  try {
    const dir = new Directory(Paths.document, PROFILE_PHOTO_DIR);
    if (!dir.exists) {
      dir.create({ intermediates: true });
    }
    const source = new File(sourceUri);
    const extension = source.extension || '.jpg';
    // Unique filename per save so React Native's Image cache doesn't show a
    // stale photo after changing it.
    const dest = new File(dir, `avatar-${Date.now()}${extension}`);
    if (dest.exists) dest.delete();
    await source.copy(dest);
    return dest.uri;
  } catch (error) {
    console.error('Failed to persist profile photo:', error);
    return sourceUri;
  }
}

// Removes a previously persisted photo file (best effort). Only touches files
// inside our own photo folder so we never delete the picker's originals.
function deletePersistedPhoto(uri: string | null) {
  if (!uri || !uri.includes(PROFILE_PHOTO_DIR)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (error) {
    console.error('Failed to delete old profile photo:', error);
  }
}

function calculateAge(dateOfBirth: string): number {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

function formatMemberSince(isoString: string | null): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const router = useRouter();
  const largeDisplayMode = useSettingsStore(s => s.largeDisplayMode);
  useTextScaleSubscription(); // re-render when global text size changes
  const { data: unlock } = useUnlockState();
  const restore = useRestoreSubscription();
  const [profile, setProfile] = useState<UserProfile>({
    name: '',
    screenName: '',
    dateOfBirth: null,
    dobVisible: true,
    gender: null,
    photoUri: null,
    memberSince: null,
  });
  const [isEditing, setIsEditing] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load profile on mount
  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      console.log('[PROFILE] Loading profile from storage...');
      // Admin section disabled — keep it locked regardless of any stored flag.
      await AsyncStorage.setItem('admin-unlocked', 'false');
      const data = await AsyncStorage.getItem(PROFILE_STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        console.log('[PROFILE] Successfully loaded:', parsed.screenName);
        setProfile(parsed);
        if (parsed.screenName) {
          setRemoteLogUser(parsed.screenName);
          remoteLog('app_opened', { name: parsed.name, screenName: parsed.screenName, gender: parsed.gender });
        }
        // If profile is incomplete, show edit mode
        if (!parsed.name || !parsed.screenName) {
          setIsEditing(true);
        }
      } else {
        console.log('[PROFILE] No existing profile found');
        // No profile yet, show edit mode
        setIsEditing(true);
      }
    } catch (error) {
      console.error('[PROFILE] Failed to load profile:', error);
      setIsEditing(true);
    }
    setIsLoaded(true);
  };

  const saveProfile = async () => {
    try {
      const profileToSave = {
        ...profile,
        memberSince: profile.memberSince ?? new Date().toISOString(),
      };
      console.log('[PROFILE] Saving profile...', profileToSave.screenName);
      const jsonValue = JSON.stringify(profileToSave);
      await AsyncStorage.setItem(PROFILE_STORAGE_KEY, jsonValue);

      // Verify immediately
      const verified = await AsyncStorage.getItem(PROFILE_STORAGE_KEY);
      if (verified) {
        setProfile(JSON.parse(verified));
        setIsEditing(false);
        remoteLog('profile_updated', { hasPhoto: !!profile.photoUri });
      }
    } catch (error) {
      console.error('[PROFILE] Failed to save profile:', error);
      Alert.alert('Save Failed', 'Please try again.');
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled) {
      const sourceUri = result.assets[0].uri;
      const persistentUri = await persistProfilePhoto(sourceUri);
      deletePersistedPhoto(profile.photoUri);
      setProfile({ ...profile, photoUri: persistentUri });
    }
  };

  const updatePhoto = async (uri: string | null) => {
    if (!uri) deletePersistedPhoto(profile.photoUri);
    setProfile({ ...profile, photoUri: uri });
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setProfile({ ...profile, dateOfBirth: selectedDate.toISOString() });
    }
  };

  const handlePhotoPress = () => {
    if (!isEditing) return;
    Alert.alert(
      'Profile Photo',
      'Choose an option',
      [
        { text: 'Choose from Library', onPress: pickImage },
        ...(profile.photoUri ? [{ text: 'Remove Photo', onPress: () => updatePhoto(null), style: 'destructive' as const }] : []),
        { text: 'Cancel', style: 'cancel' as const },
      ]
    );
  };

  const handleRestore = async () => {
    try {
      const { restored } = await restore.mutateAsync();
      if (restored) {
        Alert.alert('Subscription Restored', 'Your access has been successfully restored.');
      } else {
        Alert.alert('Nothing to Restore', 'We could not find an active subscription for this account.');
      }
    } catch (err) {
      Alert.alert('Restore failed', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  // Membership card.
  const renderMembershipCard = () => (
    <>
      {renderMembershipCardBody()}
    </>
  );

  const renderMembershipCardBody = () => {
    if (unlock?.hasFullAccess) {
      return (
        <Pressable
          onPress={() => router.push('/unlock')}
          style={{ backgroundColor: theme.card, borderColor: 'rgba(249,115,22,0.4)' }}
          className="mx-4 mt-4 rounded-2xl p-4 border active:opacity-80"
        >
          <View className="flex-row items-center">
            <CalendarClock size={largeDisplayMode ? 22 : 20} color="#f97316" />
            <Text numberOfLines={1} style={{ color: theme.text }} className={`font-semibold ml-2 flex-shrink ${largeDisplayMode ? 'text-lg' : 'text-base'}`}>
              Glideboard Pro
            </Text>
            <View className="ml-auto bg-orange-500/15 px-2 py-0.5 rounded-full flex-shrink-0">
              <Text className={`text-orange-500 font-semibold ${largeDisplayMode ? 'text-sm' : 'text-xs'}`}>ACTIVE</Text>
            </View>
            <ChevronRight size={largeDisplayMode ? 22 : 20} color={theme.subText} className="ml-1" />
          </View>
          <Text style={{ color: theme.subText }} className={`mt-2 ${largeDisplayMode ? 'text-sm' : 'text-xs'} opacity-70`}>
            Full access - renews automatically - manage or cancel in your {STORE_SETTINGS}
          </Text>
        </Pressable>
      );
    }
    return (
      <View className="mx-4 mt-4">
        <Pressable
          onPress={() => router.push('/unlock')}
          style={{ backgroundColor: theme.card, borderColor: 'rgba(249,115,22,0.4)' }}
          className="rounded-2xl p-4 flex-row items-center justify-between border active:opacity-80"
        >
          <View className="flex-row items-center flex-1">
            <CalendarClock size={largeDisplayMode ? 22 : 20} color="#f97316" />
            <View className="ml-3 flex-1">
              <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: theme.text }} className={`font-semibold ${largeDisplayMode ? 'text-lg' : 'text-base'}`}>
                Start Subscription
              </Text>
              <Text style={{ color: theme.subText }} className={`mt-0.5 ${largeDisplayMode ? 'text-sm' : 'text-xs'} opacity-70`}>
                Full access - from $1.19/mo
              </Text>
            </View>
          </View>
          <ChevronRight size={largeDisplayMode ? 22 : 20} color={theme.subText} />
        </Pressable>

        <Pressable
          onPress={handleRestore}
          className="mt-2 py-1 items-center active:opacity-60"
        >
          <Text style={{ color: theme.subText }} className={`font-medium underline ${largeDisplayMode ? 'text-sm' : 'text-xs'} opacity-60`}>
            Already a member? Restore purchase
          </Text>
        </Pressable>
      </View>
    );
  };

  if (!isLoaded) {
    return <View style={{ flex: 1, backgroundColor: theme.background }} />;
  }

  // Profile View Mode
  if (!isEditing) {
    const age = profile.dateOfBirth ? calculateAge(profile.dateOfBirth) : null;

    return (
      <ScrollView
        style={{ backgroundColor: theme.background }}
        className="flex-1"
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={{ color: theme.text }} className={`font-bold text-center mt-6 ${largeDisplayMode ? 'text-3xl' : 'text-4xl'}`}>Profile</Text>

        {/* User Card */}
        <View className="mx-4 mt-6">
          <View style={{ backgroundColor: theme.card }} className="rounded-3xl p-6 items-center">
            <Pressable onPress={handlePhotoPress} className="relative">
              {profile.photoUri ? (
                <Image source={{ uri: profile.photoUri }} className="w-24 h-24 rounded-full" />
              ) : (
                <View style={{ backgroundColor: theme.background === '#ffffff' ? '#f3f4f6' : '#1f2937' }} className="w-24 h-24 rounded-full items-center justify-center">
                  <User size={48} color={theme.subText} />
                </View>
              )}
            </Pressable>

            <Text style={{ color: theme.text }} className={`font-bold mt-4 ${largeDisplayMode ? 'text-xl' : 'text-2xl'}`}>{profile.name || 'Set Name'}</Text>
            <Text style={{ color: theme.subText }} className={`mt-1 opacity-70 ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>@{profile.screenName || 'username'}</Text>

            <View className="flex-row mt-6 w-full border-t border-gray-800 pt-6">
              <View className="flex-1 items-center">
                <Text style={{ color: theme.text }} className={`font-bold ${largeDisplayMode ? 'text-base' : 'text-lg'}`}>{age || '--'}</Text>
                <Text style={{ color: theme.subText }} className={`text-xs mt-1 uppercase tracking-widest opacity-60`}>Age</Text>
              </View>
              <View style={{ backgroundColor: theme.divider }} className="w-px h-10" />
              <View className="flex-1 items-center">
                <Text style={{ color: theme.text }} className={`font-bold ${largeDisplayMode ? 'text-base' : 'text-lg'}`}>{profile.gender || '--'}</Text>
                <Text style={{ color: theme.subText }} className={`text-xs mt-1 uppercase tracking-widest opacity-60`}>Gender</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Membership Section */}
        {renderMembershipCard()}

        {/* App Info List */}
        <View className="mx-4 mt-6">
          <View style={{ backgroundColor: theme.card }} className="rounded-2xl overflow-hidden">
            <Pressable
              onPress={() => setIsEditing(true)}
              className="flex-row items-center p-4 border-b border-gray-800 active:bg-gray-800"
            >
              <User size={20} color="#f97316" />
              <Text style={{ color: theme.text }} className="ml-3 flex-1 font-medium">Edit Personal Info</Text>
              <ChevronRight size={20} color="#6b7280" />
            </Pressable>

            <Pressable
              onPress={() => router.push('/app-settings')}
              className="flex-row items-center p-4 border-b border-gray-800 active:bg-gray-800"
            >
              <Settings size={20} color="#f97316" />
              <Text style={{ color: theme.text }} className="ml-3 flex-1 font-medium">App Settings</Text>
              <ChevronRight size={20} color="#6b7280" />
            </Pressable>

            <Pressable
              onPress={() => router.push('/how-it-works')}
              className="flex-row items-center p-4 border-b border-gray-800 active:bg-gray-800"
            >
              <HelpCircle size={20} color="#f97316" />
              <Text style={{ color: theme.text }} className="ml-3 flex-1 font-medium">How it Works</Text>
              <ChevronRight size={20} color="#6b7280" />
            </Pressable>

            <Pressable
              onPress={() => router.push('/privacy-policy')}
              className="flex-row items-center p-4 active:bg-gray-800"
            >
              <Shield size={20} color="#f97316" />
              <Text style={{ color: theme.text }} className="ml-3 flex-1 font-medium">Privacy Policy</Text>
              <ChevronRight size={20} color="#6b7280" />
            </Pressable>
          </View>
        </View>

        {/* Footer */}
        <View className="mt-8 items-center">
          <Text style={{ color: theme.subText }} className="text-xs opacity-50 font-bold uppercase tracking-widest">
            Glideboard V1.2.7 (Build 285)
          </Text>
        </View>
      </ScrollView>
    );
  }

  // Profile Edit Mode
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: insets.top, paddingHorizontal: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ color: theme.text }} className="text-3xl font-bold mt-6 mb-2">Edit Profile</Text>
        <Text style={{ color: theme.subText }} className="text-base mb-8">Personalize your experience</Text>

        {/* Photo Upload */}
        <View className="items-center mb-8">
          <Pressable onPress={handlePhotoPress} className="relative">
            <View style={{ backgroundColor: theme.card }} className="w-24 h-24 rounded-full items-center justify-center overflow-hidden">
              {profile.photoUri ? (
                <Image source={{ uri: profile.photoUri }} className="w-full h-full" />
              ) : (
                <User size={48} color={theme.subText} />
              )}
            </View>
            <View className="absolute bottom-0 right-0 bg-orange-500 w-8 h-8 rounded-full items-center justify-center border-2 border-black">
              <ImageIcon size={16} color="white" />
            </View>
          </Pressable>
        </View>

        {/* Input Fields */}
        <View className="space-y-4">
          <View>
            <Text style={{ color: theme.subText }} className="text-xs font-bold uppercase tracking-widest ml-1 mb-2">Display Name</Text>
            <TextInput
              value={profile.name}
              onChangeText={(t) => setProfile({ ...profile, name: t })}
              placeholder="e.g. John Doe"
              placeholderTextColor={theme.subText}
              style={{ backgroundColor: theme.card, color: theme.text }}
              className="px-4 py-4 rounded-xl text-lg font-medium"
            />
          </View>

          <View className="mt-4">
            <Text style={{ color: theme.subText }} className="text-xs font-bold uppercase tracking-widest ml-1 mb-2">Screen Name</Text>
            <TextInput
              value={profile.screenName}
              onChangeText={(t) => setProfile({ ...profile, screenName: t })}
              placeholder="e.g. johndoe123"
              placeholderTextColor={theme.subText}
              autoCapitalize="none"
              style={{ backgroundColor: theme.card, color: theme.text }}
              className="px-4 py-4 rounded-xl text-lg font-medium"
            />
          </View>

          <View className="mt-4">
            <Text style={{ color: theme.subText }} className="text-xs font-bold uppercase tracking-widest ml-1 mb-2">Date of Birth</Text>
            <Pressable
              onPress={() => setShowDatePicker(true)}
              style={{ backgroundColor: theme.card }}
              className="px-4 py-4 rounded-xl flex-row items-center justify-between"
            >
              <Text style={{ color: profile.dateOfBirth ? theme.text : theme.subText }} className="text-lg font-medium">
                {profile.dateOfBirth ? new Date(profile.dateOfBirth).toLocaleDateString() : 'Select date'}
              </Text>
              <CalendarClock size={20} color="#6b7280" />
            </Pressable>
          </View>

          <View className="mt-4">
            <Text style={{ color: theme.subText }} className="text-xs font-bold uppercase tracking-widest ml-1 mb-2">Gender</Text>
            <View className="flex-row">
              {(['male', 'female'] as const).map((g) => (
                <Pressable
                  key={g}
                  onPress={() => setProfile({ ...profile, gender: g })}
                  className={`flex-1 flex-row items-center justify-center py-4 rounded-xl mr-2 ${profile.gender === g ? 'bg-orange-500' : 'bg-gray-900'}`}
                  style={{ backgroundColor: profile.gender === g ? '#f97316' : theme.card }}
                >
                  <Text className={`font-bold capitalize ${profile.gender === g ? 'text-white' : 'text-gray-400'}`}>
                    {g}
                  </Text>
                  {profile.gender === g && <Check size={16} color="white" className="ml-2" />}
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={profile.dateOfBirth ? new Date(profile.dateOfBirth) : new Date(2000, 0, 1)}
            mode="date"
            display="spinner"
            onChange={onDateChange}
            maximumDate={new Date()}
          />
        )}

        <View className="mt-12 space-y-3">
          <Pressable
            onPress={saveProfile}
            className="bg-orange-500 py-4 rounded-2xl items-center shadow-lg shadow-orange-500/30 active:opacity-80"
          >
            <Text className="text-white font-bold text-xl">Save Profile</Text>
          </Pressable>

          {profile.screenName && (
            <Pressable
              onPress={() => setIsEditing(false)}
              className="py-4 items-center active:opacity-60"
            >
              <Text style={{ color: theme.subText }} className="font-semibold">Cancel</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
