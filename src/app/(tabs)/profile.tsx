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
      if (verified === jsonValue) {
        console.log('[PROFILE] Persistence verified successfully');
      } else {
        console.warn('[PROFILE] Verification failed - saved data mismatch');
      }

      setProfile(profileToSave);
      setIsEditing(false);
      setRemoteLogUser(profileToSave.screenName);
      remoteLog('profile_saved', { name: profileToSave.name, screenName: profileToSave.screenName, gender: profileToSave.gender });
    } catch (error) {
      console.error('[PROFILE] Failed to save profile:', error);
      Alert.alert('Error', 'Failed to save profile. Please try again.');
    }
  };

  const updateField = <K extends keyof UserProfile>(field: K, value: UserProfile[K]) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  // Update and immediately save photo to storage. `photoUri` should already be
  // a persistent uri (or null to remove). Cleans up the previously stored file.
  const updatePhoto = async (photoUri: string | null) => {
    const previousUri = profile.photoUri;
    const updatedProfile = {
      ...profile,
      photoUri,
      memberSince: profile.memberSince ?? new Date().toISOString(),
    };
    setProfile(updatedProfile);
    try {
      await AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(updatedProfile));
      // Only remove the old file once the new value is safely saved.
      if (previousUri && previousUri !== photoUri) {
        deletePersistedPhoto(previousUri);
      }
    } catch (error) {
      console.error('Failed to save photo:', error);
    }
  };

  const clearDateOfBirth = () => {
    updateField('dateOfBirth', null);
  };

  const handleDateChange = (event: unknown, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      updateField('dateOfBirth', selectedDate.toISOString());
    }
  };

  const formatDate = (isoString: string | null): string => {
    if (!isoString) return 'Select date';
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    });
  };

  const pickImage = async () => {
    // Request permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library to add a profile photo.');
      return;
    }

    // Launch image picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const selectedUri = result.assets[0].uri;
      Alert.alert(
        'Save Profile Photo?',
        'Would you like to save this image as your profile picture?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Save',
            onPress: async () => {
              const persistedUri = await persistProfilePhoto(selectedUri);
              updatePhoto(persistedUri);
            }
          },
        ]
      );
    }
  };

  const showPhotoOptions = () => {
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
          className="mx-4 mt-4 bg-gray-900 rounded-2xl p-4 border border-orange-500/40 active:opacity-80"
        >
          <View className="flex-row items-center">
            <CalendarClock size={largeDisplayMode ? 22 : 20} color="#f97316" />
            <Text numberOfLines={1} className={`text-white font-semibold ml-2 flex-shrink ${largeDisplayMode ? 'text-lg' : 'text-base'}`}>
              Glideboard Pro
            </Text>
            <View className="ml-auto bg-orange-500/15 px-2 py-0.5 rounded-full flex-shrink-0">
              <Text className={`text-orange-400 font-semibold ${largeDisplayMode ? 'text-sm' : 'text-xs'}`}>ACTIVE</Text>
            </View>
            <ChevronRight size={largeDisplayMode ? 22 : 20} color="#6b7280" className="ml-1" />
          </View>
          <Text className={`text-gray-500 mt-2 ${largeDisplayMode ? 'text-sm' : 'text-xs'}`}>
            Full access · renews automatically · manage or cancel in your {STORE_SETTINGS}
          </Text>
        </Pressable>
      );
    }
    return (
      <View className="mx-4 mt-4">
        <Pressable
          onPress={() => router.push('/unlock')}
          className="bg-gray-900 rounded-2xl p-4 flex-row items-center justify-between border border-orange-500/40 active:opacity-80"
        >
          <View className="flex-row items-center flex-1">
            <CalendarClock size={largeDisplayMode ? 22 : 20} color="#f97316" />
            <View className="ml-3 flex-1">
              <Text numberOfLines={1} adjustsFontSizeToFit className={`text-white font-semibold ${largeDisplayMode ? 'text-lg' : 'text-base'}`}>
                Start Subscription
              </Text>
              <Text className={`text-gray-500 mt-0.5 ${largeDisplayMode ? 'text-sm' : 'text-xs'}`}>
                Full access · from $1.19/mo
              </Text>
            </View>
          </View>
          <ChevronRight size={largeDisplayMode ? 22 : 20} color="#6b7280" />
        </Pressable>

        <Pressable
          onPress={handleRestore}
          className="mt-2 py-1 items-center active:opacity-60"
        >
          <Text className={`text-gray-500 font-medium underline ${largeDisplayMode ? 'text-sm' : 'text-xs'}`}>
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

        {/* Photo */}
        <Pressable
          onPress={showPhotoOptions}
          className="items-center mt-6"
        >
          <View style={{ backgroundColor: theme.card, borderColor: '#f97316' }} className={`rounded-full border-4 items-center justify-center overflow-hidden ${largeDisplayMode ? 'w-28 h-28' : 'w-32 h-32'}`}>
            {profile.photoUri ? (
              <Image
                source={{ uri: profile.photoUri }}
                className="w-full h-full"
                resizeMode="cover"
              />
            ) : (
              <User size={largeDisplayMode ? 50 : 60} color={theme.subText} />
            )}
          </View>
          <Text className={`text-orange-500 mt-2 ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>Tap to change photo</Text>
        </Pressable>

        {/* Name and Screen Name */}
        <View className="items-center mt-4 px-4">
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: theme.text }} className={`font-bold text-center ${largeDisplayMode ? 'text-2xl' : 'text-3xl'}`}>{profile.name}</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: theme.subText }} className={`mt-1 text-center ${largeDisplayMode ? 'text-lg' : 'text-xl'}`}>@{profile.screenName}</Text>
          <Text style={{ color: theme.subText }} className={`mt-2 text-center ${largeDisplayMode ? 'text-base' : 'text-lg'} opacity-80`}>
            Member since {formatMemberSince(profile.memberSince)}
          </Text>
        </View>

        {/* Info Card */}
        <View style={{ backgroundColor: theme.card }} className="mx-4 mt-6 rounded-2xl p-4">
          <Text style={{ color: theme.subText }} className={`${largeDisplayMode ? 'text-sm' : 'text-xs'}`}>GENDER</Text>
          <Text style={{ color: theme.text }} className={`mt-1 capitalize ${largeDisplayMode ? 'text-xl' : 'text-lg'}`}>
            {profile.gender ?? 'Not set'}
          </Text>

          {profile.dobVisible && age !== null && (
            <>
              <Text style={{ color: theme.subText }} className={`mt-4 ${largeDisplayMode ? 'text-sm' : 'text-xs'}`}>AGE</Text>
              <Text style={{ color: theme.text }} className={`mt-1 ${largeDisplayMode ? 'text-xl' : 'text-lg'}`}>{age} years old</Text>
            </>
          )}
        </View>

        {/* Membership status. Always tappable so there's always a path to the
            subscription screen where the user can start a paid membership or
            restore a purchase (required by both Apple and Google Play). */}
        {renderMembershipCard()}

        {/* How It Works */}
        <Pressable
          onPress={() => router.push('/how-it-works')}
          style={{ backgroundColor: theme.card }}
          className="mx-4 mt-4 rounded-2xl p-4 flex-row items-center justify-between active:opacity-80"
        >
          <View className="flex-row items-center">
            <HelpCircle size={largeDisplayMode ? 22 : 20} color="#f97316" />
            <Text style={{ color: theme.subText }} className={`ml-2 ${largeDisplayMode ? 'text-lg' : 'text-base'}`}>How It Works</Text>
          </View>
          <ChevronRight size={largeDisplayMode ? 22 : 20} color={theme.subText} />
        </Pressable>

        {/* App Settings */}
        <Pressable
          onPress={() => router.push('/app-settings')}
          style={{ backgroundColor: theme.card }}
          className="mx-4 mt-3 rounded-2xl p-4 flex-row items-center justify-between active:opacity-80"
        >
          <View className="flex-row items-center">
            <Settings size={largeDisplayMode ? 22 : 20} color="#f97316" />
            <Text style={{ color: theme.subText }} className={`ml-2 ${largeDisplayMode ? 'text-lg' : 'text-base'}`}>App Settings</Text>
          </View>
          <ChevronRight size={largeDisplayMode ? 22 : 20} color={theme.subText} />
        </Pressable>

        {/* Privacy Policy */}
        <Pressable
          onPress={() => router.push('/privacy-policy')}
          style={{ backgroundColor: theme.card }}
          className="mx-4 mt-3 rounded-2xl p-4 flex-row items-center justify-between active:opacity-80"
        >
          <View className="flex-row items-center">
            <Shield size={largeDisplayMode ? 22 : 20} color="#f97316" />
            <Text style={{ color: theme.subText }} className={`ml-2 ${largeDisplayMode ? 'text-lg' : 'text-base'}`}>Privacy Policy</Text>
          </View>
          <ChevronRight size={largeDisplayMode ? 22 : 20} color={theme.subText} />
        </Pressable>

        {/* Edit Button */}
        <Pressable
          onPress={() => setIsEditing(true)}
          className="mx-4 mt-6 border-2 border-orange-500 py-4 rounded-xl items-center active:opacity-80"
        >
          <Text className={`text-orange-500 font-semibold ${largeDisplayMode ? 'text-xl' : 'text-lg'}`}>Edit Profile</Text>
        </Pressable>

        {/* Troubleshooting Access */}
        <Pressable
          onPress={() => router.push('/diagnostics')}
          style={{ backgroundColor: `${theme.card}80`, borderColor: theme.border }}
          className="mx-4 mt-8 border py-4 rounded-xl items-center flex-row justify-center active:opacity-70"
        >
          <Activity size={18} color="#f97316" />
          <Text style={{ color: theme.subText }} className="font-bold ml-2 uppercase tracking-widest text-xs">
            Troubleshoot Counting
          </Text>
        </Pressable>

        {/* Version Footer */}
        <View className="mt-4 mb-4 items-center">
          <Text style={{ color: theme.subText }} className="text-xs font-bold uppercase tracking-widest opacity-60">
            Glideboard V1.2.7 (Build 279)
          </Text>
        </View>
      </ScrollView>
    );
  }

  // Edit Profile Mode
  return (
    <KeyboardAvoidingView
      className="flex-1 bg-black"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ paddingTop: insets.top }}
    >
      {/* Top Header Bar - ensures user can always save/cancel without scrolling */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-800">
        <Pressable
          onPress={() => {
            loadProfile();
            setIsEditing(false);
          }}
          hitSlop={12}
          className="active:opacity-60 py-1 pr-4"
        >
          <Text className={`text-gray-400 font-medium ${largeDisplayMode ? 'text-lg' : 'text-base'}`}>Cancel</Text>
        </Pressable>

        <Text className={`text-white font-bold italic ${largeDisplayMode ? 'text-xl' : 'text-lg'}`}>Edit Profile</Text>

        <Pressable
          onPress={saveProfile}
          hitSlop={12}
          className="active:opacity-60 py-1 pl-4"
        >
          <Text className={`text-orange-500 font-bold ${largeDisplayMode ? 'text-lg' : 'text-base'}`}>Save</Text>
        </Pressable>
      </View>

      <ScrollView
        className="flex-1 bg-black"
        contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Photo */}
        <Pressable onPress={showPhotoOptions} className="items-center mt-8">
        <View className={`rounded-full border-2 border-dashed border-orange-500 items-center justify-center overflow-hidden ${largeDisplayMode ? 'w-28 h-28' : 'w-32 h-32'}`}>
          {profile.photoUri ? (
            <Image
              source={{ uri: profile.photoUri }}
              className="w-full h-full"
              resizeMode="cover"
            />
          ) : (
            <ImageIcon size={largeDisplayMode ? 32 : 40} color="#f97316" />
          )}
        </View>
        <Text className={`text-orange-500 mt-3 ${largeDisplayMode ? 'text-base' : 'text-lg'}`}>
          {profile.photoUri ? 'Change Photo' : 'Add Photo'}
        </Text>
      </Pressable>

      {/* Membership — visible right here on first open so users can
          subscribe without finishing the profile first. */}
      {renderMembershipCard()}

      {/* How It Works */}
      <Pressable
        onPress={() => router.push('/how-it-works')}
        className="mx-4 mt-3 bg-gray-900 rounded-2xl p-4 flex-row items-center justify-between active:opacity-80"
      >
        <View className="flex-row items-center">
          <HelpCircle size={largeDisplayMode ? 22 : 20} color="#f97316" />
          <Text className={`text-gray-400 ml-2 ${largeDisplayMode ? 'text-lg' : 'text-base'}`}>How It Works</Text>
        </View>
        <ChevronRight size={largeDisplayMode ? 22 : 20} color="#6b7280" />
      </Pressable>

      {/* Privacy Policy */}
      <Pressable
        onPress={() => router.push('/privacy-policy')}
        className="mx-4 mt-3 bg-gray-900 rounded-2xl p-4 flex-row items-center justify-between active:opacity-80"
      >
        <View className="flex-row items-center">
          <Shield size={largeDisplayMode ? 22 : 20} color="#f97316" />
          <Text className={`text-gray-400 ml-2 ${largeDisplayMode ? 'text-lg' : 'text-base'}`}>Privacy Policy</Text>
        </View>
        <ChevronRight size={largeDisplayMode ? 22 : 20} color="#6b7280" />
      </Pressable>

      {/* Form */}
      <View className="px-4 mt-6">
        {/* Name */}
        <Text className={`text-gray-500 mb-2 ${largeDisplayMode ? 'text-sm' : 'text-xs'}`}>NAME *</Text>
        <TextInput
          className={`bg-gray-900 text-white px-4 py-3 rounded-xl mb-4 ${largeDisplayMode ? 'text-lg' : 'text-base'}`}
          value={profile.name}
          onChangeText={(text) => updateField('name', text)}
          placeholder="Enter your name"
          placeholderTextColor="#6b7280"
        />

        {/* Screen Name */}
        <Text className={`text-gray-500 mb-2 ${largeDisplayMode ? 'text-sm' : 'text-xs'}`}>SCREEN NAME *</Text>
        <TextInput
          className={`bg-gray-900 text-white px-4 py-3 rounded-xl mb-4 ${largeDisplayMode ? 'text-lg' : 'text-base'}`}
          value={profile.screenName}
          onChangeText={(text) => updateField('screenName', text)}
          placeholder="Enter screen name"
          placeholderTextColor="#6b7280"
          autoCapitalize="none"
        />

        {/* Date of Birth */}
        <View className="flex-row items-center justify-between mb-2">
          <Text numberOfLines={1} className={`text-gray-500 flex-shrink mr-2 ${largeDisplayMode ? 'text-sm' : 'text-xs'}`}>DATE OF BIRTH (OPTIONAL)</Text>
          <View className="flex-row items-center flex-shrink-0">
            <Pressable
              onPress={clearDateOfBirth}
              className="flex-row items-center bg-gray-800 px-3 py-1 rounded-lg mr-3"
            >
              <Text className={`text-gray-400 ${largeDisplayMode ? 'text-sm' : 'text-xs'}`}>× Clear</Text>
            </Pressable>
            <Pressable
              onPress={() => updateField('dobVisible', !profile.dobVisible)}
              className="flex-row items-center"
            >
              <View
                className={`w-6 h-6 rounded items-center justify-center mr-2 ${
                  profile.dobVisible ? 'bg-orange-500' : 'bg-gray-800'
                }`}
              >
                {profile.dobVisible && <Check size={16} color="#fff" />}
              </View>
              <Text className={`text-gray-400 ${largeDisplayMode ? 'text-sm' : 'text-xs'}`}>Visible</Text>
            </Pressable>
          </View>
        </View>
        <Pressable
          onPress={() => setShowDatePicker(true)}
          className="bg-gray-900 px-4 py-3 rounded-xl mb-4"
        >
          <Text className={`text-white ${largeDisplayMode ? 'text-lg' : 'text-base'}`}>{formatDate(profile.dateOfBirth)}</Text>
        </Pressable>

        {showDatePicker && (
          <DateTimePicker
            value={profile.dateOfBirth ? new Date(profile.dateOfBirth) : new Date(2000, 0, 1)}
            mode="date"
            display="spinner"
            onChange={handleDateChange}
            maximumDate={new Date()}
            minimumDate={new Date(1900, 0, 1)}
            themeVariant="dark"
          />
        )}

        {/* Gender */}
        <Text className={`text-gray-500 mb-2 ${largeDisplayMode ? 'text-sm' : 'text-xs'}`}>GENDER *</Text>
        <View className="flex-row mb-6">
          <Pressable
            onPress={() => updateField('gender', 'male')}
            className={`flex-1 py-3 rounded-xl items-center mr-2 ${
              profile.gender === 'male' ? 'bg-orange-500' : 'bg-gray-900'
            }`}
          >
            <Text className={`text-white font-semibold ${largeDisplayMode ? 'text-xl' : 'text-lg'}`}>Male</Text>
          </Pressable>
          <Pressable
            onPress={() => updateField('gender', 'female')}
            className={`flex-1 py-3 rounded-xl items-center ml-2 ${
              profile.gender === 'female' ? 'bg-orange-500' : 'bg-gray-900'
            }`}
          >
            <Text className={`text-white font-semibold ${largeDisplayMode ? 'text-xl' : 'text-lg'}`}>Female</Text>
          </Pressable>
        </View>

        {/* Buttons */}
        <Pressable
          onPress={saveProfile}
          className="bg-orange-500 py-4 rounded-xl items-center mb-4 active:opacity-80"
        >
          <Text className={`text-white font-semibold ${largeDisplayMode ? 'text-xl' : 'text-lg'}`}>Save Changes</Text>
        </Pressable>

        {profile.memberSince && (
          <Pressable
            onPress={() => {
              loadProfile();
              setIsEditing(false);
            }}
            className="bg-gray-900 py-4 rounded-xl items-center active:opacity-80"
          >
            <Text className={`text-gray-400 ${largeDisplayMode ? 'text-xl' : 'text-lg'}`}>Cancel</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}
