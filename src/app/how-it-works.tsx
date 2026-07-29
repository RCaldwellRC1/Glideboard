import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ChevronLeft,
  Smartphone,
  Play,
  Activity,
  Mic,
  Gauge,
  Timer,
  Eye,
  Trophy,
  ShieldCheck,
} from 'lucide-react-native';
import { useSettingsStore, useTextScaleSubscription } from '@/lib/settings';

interface Section {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  title: string;
  body: string[];
}

const SECTIONS: Section[] = [
  {
    icon: Play,
    title: 'Starting a workout',
    body: [
      'On the Tracker tab, tap START WORKOUT to begin a session.',
      'Pick your exercise and incline level at the top of the screen.',
      'When you’re ready for a set, tap START NEXT SET — then do your reps.',
      'Tap END SET when the set is done. Repeat for each set, then tap END WORKOUT to finish.',
    ],
  },
  {
    icon: Smartphone,
    title: 'Where to place your phone',
    body: [
      'Place the phone on the Glideboard — above or below you, depending on the exercise.',
      'Set the phone in place BEFORE you tap START NEXT SET, so it’s steady when counting begins.',
      'Keep the phone secure on the board so it moves with you and reads each rep cleanly.',
    ],
  },
  {
    icon: Activity,
    title: 'Auto rep counting (motion)',
    body: [
      'By default the app counts your reps automatically using the phone’s motion sensors.',
      'Each glide of the board is read as one rep — no tapping needed during the set.',
      'IMPORTANT — do this before your first workout: set your Pace Settings (App Settings → Pace Settings) to match your real pace and your pauses. The app uses your pace to know about how long one rep should take, so it won’t read a single glide as two. Setting this first is what makes your counts the most accurate.',
    ],
  },
  {
    icon: Gauge,
    title: 'If the count is off',
    body: [
      'If the auto counter OVER-counts, set Motion Sensitivity one level LOWER (in App Settings → Motion Sensitivity / speed).',
      'If it UNDER-counts, set it one level HIGHER.',
      'The app learns your pace and range of motion over time — setting the right speed level helps it learn faster.',
    ],
  },
  {
    icon: Mic,
    title: 'Voice counting (optional)',
    body: [
      'Prefer to count out loud? Turn on Voice Counting in App Settings.',
      'Allow microphone access when prompted, then simply say each rep number as you go.',
      'Use voice counting when motion counting isn’t a good fit for an exercise.',
    ],
  },
  {
    icon: Timer,
    title: 'Pace-Setter Timer',
    body: [
      'Want a steady tempo? The Pace-Setter Timer guides your lift, hold, and down phases.',
      'Adjust each phase in App Settings → Pace Settings to match the tempo you train at.',
      'Setting your pace accurately does more than guide tempo — it also keeps the motion counter accurate, because the app uses your pace to space out reps and avoid double-counting.',
    ],
  },
  {
    icon: Eye,
    title: 'Large Display Mode',
    body: [
      'Turn on Large Display Mode in App Settings for bigger text and numbers that are easy to read mid-set.',
    ],
  },
  {
    icon: Trophy,
    title: 'History & Trophies',
    body: [
      'Every finished workout is saved to the History tab so you can track progress.',
      'Hit milestones to earn Trophies as you keep training.',
    ],
  },
  {
    icon: ShieldCheck,
    title: 'Permissions',
    body: [
      'Motion access lets the app automatically count your reps.',
      'Microphone access is only used for Voice Counting, and only while a set is active.',
    ],
  },
];

export default function HowItWorksScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const largeDisplayMode = useSettingsStore((s) => s.largeDisplayMode);
  useTextScaleSubscription(); // re-render when global text size changes

  const titleSize = largeDisplayMode ? 'text-lg' : 'text-base';
  const bodySize = largeDisplayMode ? 'text-base' : 'text-sm';

  return (
    <View className="flex-1 bg-black">
      {/* Header */}
      <View style={{ paddingTop: insets.top + 6 }} className="px-4 pb-3 flex-row items-center border-b border-gray-900">
        <Pressable onPress={() => router.back()} hitSlop={12} className="p-1 -ml-1 active:opacity-70">
          <ChevronLeft size={28} color="#f97316" />
        </Pressable>
        <Text numberOfLines={1} adjustsFontSizeToFit className={`text-white font-bold ml-1 flex-1 ${largeDisplayMode ? 'text-xl' : 'text-2xl'}`}>How It Works</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className={`text-gray-400 mb-5 leading-5 ${bodySize}`}>
          A quick guide to tracking your reps and getting the most accurate counts.
        </Text>

        {SECTIONS.map((section, i) => {
          const Icon = section.icon;
          return (
            <View key={section.title} className="bg-gray-900 rounded-2xl p-4 mb-3">
              <View className="flex-row items-center mb-3">
                <View className="w-9 h-9 rounded-full bg-orange-500/15 items-center justify-center mr-3">
                  <Icon size={18} color="#f97316" />
                </View>
                <Text className={`text-white font-semibold flex-1 ${titleSize}`}>
                  {i + 1}. {section.title}
                </Text>
              </View>
              {section.body.map((line, idx) => (
                <View key={idx} className="flex-row mb-2">
                  <Text className="text-orange-500 mr-2">•</Text>
                  <Text className={`text-gray-300 flex-1 leading-5 ${bodySize}`}>{line}</Text>
                </View>
              ))}
            </View>
          );
        })}

        <Text className={`text-gray-600 text-center mt-4 ${largeDisplayMode ? 'text-sm' : 'text-xs'}`}>
          You can reopen this guide any time from the Profile tab.
        </Text>
      </ScrollView>
    </View>
  );
}
