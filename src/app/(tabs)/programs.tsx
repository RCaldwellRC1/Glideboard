import { useEffect } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Sparkles, Target, CalendarDays, TrendingUp, ChevronRight, Dumbbell } from 'lucide-react-native';
import { useSettingsStore, useTextScaleSubscription } from '@/lib/settings';
import { useHasFullAccess } from '@/lib/purchases';

const FEATURES = [
  {
    icon: Target,
    title: 'Goal-based plans',
    body: 'Strength, endurance, or fat-loss plans tailored to what you want to achieve.',
  },
  {
    icon: CalendarDays,
    title: 'Weekly structure',
    body: 'A clear day-by-day schedule so you always know what to train next.',
  },
  {
    icon: TrendingUp,
    title: 'Progressive overload',
    body: 'Your plan adapts as you get stronger, automatically scaling each week.',
  },
];

export default function ProgramsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const largeDisplayMode = useSettingsStore((s) => s.largeDisplayMode);
  useTextScaleSubscription(); // re-render when global text size changes
  const loadSettings = useSettingsStore((s) => s.loadFromStorage);
  const { hasFullAccess } = useHasFullAccess();

  useEffect(() => {
    loadSettings();
  }, []);

  return (
    <ScrollView
      className="flex-1 bg-black"
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32, paddingHorizontal: 24 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View className="flex-row items-center mb-2">
        <View className="w-10 h-10 rounded-full bg-orange-500/15 items-center justify-center mr-3">
          <Dumbbell size={22} color="#f97316" />
        </View>
        <Text className={`text-white font-bold ${largeDisplayMode ? 'text-3xl' : 'text-2xl'}`}>Programs</Text>
      </View>
      <Text className={`text-gray-400 leading-6 mb-8 ${largeDisplayMode ? 'text-lg' : 'text-base'}`}>
        Structured, multi-week training plans built around your goals.
      </Text>

      {/* Feature cards */}
      <View className="gap-3 mb-8">
        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <View key={f.title} className="flex-row bg-gray-900 rounded-2xl p-4">
              <View className="w-10 h-10 rounded-xl bg-orange-500/15 items-center justify-center mr-4">
                <Icon size={20} color="#f97316" />
              </View>
              <View className="flex-1">
                <Text className={`text-white font-semibold mb-1 ${largeDisplayMode ? 'text-lg' : 'text-base'}`}>
                  {f.title}
                </Text>
                <Text className={`text-gray-400 leading-5 ${largeDisplayMode ? 'text-base' : 'text-sm'}`}>{f.body}</Text>
              </View>
            </View>
          );
        })}
      </View>

      {hasFullAccess ? (
        /* Unlocked: be honest — the feature is on the way. Point them to a workout now. */
        <View className="bg-gray-900 rounded-2xl p-5 items-center">
          <Sparkles size={28} color="#f97316" />
          <Text className={`text-white font-bold text-center mt-3 ${largeDisplayMode ? 'text-xl' : 'text-lg'}`}>
            You're all set
          </Text>
          <Text className={`text-gray-400 text-center mt-2 leading-6 ${largeDisplayMode ? 'text-base' : 'text-sm'}`}>
            Personalized programs are rolling out to members soon. In the meantime, jump into a guided workout.
          </Text>
          <Pressable
            onPress={() => router.push('/(tabs)')}
            className="bg-orange-500 rounded-full px-8 py-4 mt-5 active:opacity-80"
          >
            <Text className="text-black font-bold text-base">Start a workout</Text>
          </Pressable>
        </View>
      ) : (
        /* Locked: working CTA into the paywall */
        <Pressable
          onPress={() => router.push('/unlock')}
          className="bg-orange-500 rounded-2xl p-5 active:opacity-80"
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-black font-bold text-lg">Unlock Programs</Text>
              <Text className="text-black/70 text-sm mt-1 leading-5">
                Get every workout, feature, and program from $1.19/month or $12.99/year.
              </Text>
            </View>
            <ChevronRight size={24} color="#000000" />
          </View>
        </Pressable>
      )}
    </ScrollView>
  );
}
