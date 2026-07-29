import React, { useEffect } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Smartphone, Mic, Activity, Check, Timer, ChevronUp, ChevronDown } from 'lucide-react-native';
import { useSettingsStore, SENSITIVITY_CONFIG, TEXT_SIZE_LABELS, type MotionSensitivity, type PaceSettings, type TextSize } from '@/lib/settings';
import { DEVICE_NAME } from '@/lib/storePlatform';

function NumberStepper({
  label,
  value,
  min,
  max,
  onChange,
  isLarge,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  isLarge: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between py-3">
      <Text className={`text-white flex-1 ${isLarge ? 'text-lg' : 'text-base'}`}>{label}</Text>
      <View className="flex-row items-center">
        <Pressable
          onPress={() => onChange(Math.max(min, value - 1))}
          className="w-10 h-10 bg-gray-800 rounded-lg items-center justify-center active:opacity-70"
        >
          <ChevronDown size={20} color={value <= min ? '#4b5563' : '#f97316'} />
        </Pressable>
        <View className="w-14 items-center">
          <Text className={`text-orange-500 font-bold ${isLarge ? 'text-2xl' : 'text-xl'}`}>{value}s</Text>
        </View>
        <Pressable
          onPress={() => onChange(Math.min(max, value + 1))}
          className="w-10 h-10 bg-gray-800 rounded-lg items-center justify-center active:opacity-70"
        >
          <ChevronUp size={20} color={value >= max ? '#4b5563' : '#f97316'} />
        </Pressable>
      </View>
    </View>
  );
}

export default function AppSettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const largeDisplayMode = useSettingsStore(s => s.largeDisplayMode);
  const setLargeDisplayMode = useSettingsStore(s => s.setLargeDisplayMode);
  const textSize = useSettingsStore(s => s.textSize);
  const setTextSize = useSettingsStore(s => s.setTextSize);
  const motionSensitivity = useSettingsStore(s => s.motionSensitivity);
  const setMotionSensitivity = useSettingsStore(s => s.setMotionSensitivity);
  const repCountingMode = useSettingsStore(s => s.repCountingMode);
  const setRepCountingMode = useSettingsStore(s => s.setRepCountingMode);
  const paceSettings = useSettingsStore(s => s.paceSettings);
  const setPaceSettings = useSettingsStore(s => s.setPaceSettings);
  const loadSettings = useSettingsStore(s => s.loadFromStorage);

  useEffect(() => {
    loadSettings();
  }, []);

  const updatePaceSetting = (key: keyof PaceSettings, value: number) => {
    setPaceSettings({ [key]: value });
  };

  return (
    <View className="flex-1 bg-black">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="flex-row items-center px-4 mt-4">
          <Pressable
            onPress={() => router.back()}
            hitSlop={16}
            className="flex-row items-center active:opacity-60 -ml-1"
          >
            <ArrowLeft size={32} color="#f97316" strokeWidth={2.5} />
            <Text className={`text-orange-500 font-bold ml-1 ${largeDisplayMode ? 'text-lg' : 'text-xl'}`}>
              Back
            </Text>
          </Pressable>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            allowFontScaling={false}
            className={`text-white font-bold flex-1 text-center mr-16 ${largeDisplayMode ? 'text-2xl' : 'text-3xl'}`}
          >
            App Settings
          </Text>
        </View>

        {/* Display Settings */}
        <View className="mx-4 mt-6 bg-gray-900 rounded-2xl p-4">
          <View className="flex-row items-center mb-3">
            <Smartphone size={largeDisplayMode ? 22 : 20} color="#f97316" />
            <Text className={`text-gray-400 ml-2 ${largeDisplayMode ? 'text-lg' : 'text-base'}`}>Display Settings</Text>
          </View>

          <Pressable
            onPress={() => setLargeDisplayMode(!largeDisplayMode)}
            className="flex-row items-center justify-between"
          >
            <View className="flex-1 mr-4">
              <Text className={`text-white ${largeDisplayMode ? 'text-lg' : 'text-base'}`}>Compact Mode</Text>
              <Text className={`text-gray-500 mt-1 ${largeDisplayMode ? 'text-sm' : 'text-xs'}`}>
                Shrinks text and spacing to fit more on screen — handy if your {DEVICE_NAME} uses larger system display settings
              </Text>
            </View>
            <View
              className={`w-14 h-8 rounded-full items-center justify-center ${
                largeDisplayMode ? 'bg-orange-500' : 'bg-gray-700'
              }`}
            >
              <View
                className={`w-6 h-6 rounded-full bg-white absolute ${
                  largeDisplayMode ? 'right-1' : 'left-1'
                }`}
              />
            </View>
          </Pressable>

          {/* Text Size — scales the font on every screen. Medium matches the
              app's original sizing, so it's the safe default. */}
          <View className="h-px bg-gray-800 my-4" />
          <Text className={`text-white ${largeDisplayMode ? 'text-lg' : 'text-base'}`}>Text Size</Text>
          <Text className={`text-gray-500 mt-1 ${largeDisplayMode ? 'text-sm' : 'text-xs'}`}>
            Adjusts text across the whole app for easier reading
          </Text>
          <View className="flex-row mt-3 bg-gray-800 rounded-xl p-1">
            {(['small', 'medium', 'large'] as TextSize[]).map((size) => {
              const active = textSize === size;
              return (
                <Pressable
                  key={size}
                  onPress={() => setTextSize(size)}
                  className={`flex-1 items-center justify-center rounded-lg py-2.5 ${active ? 'bg-orange-500' : ''}`}
                >
                  <Text
                    className={`font-semibold ${active ? 'text-black' : 'text-gray-300'} ${
                      size === 'small' ? 'text-sm' : size === 'large' ? 'text-xl' : 'text-base'
                    }`}
                  >
                    {TEXT_SIZE_LABELS[size]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Rep Counting Mode */}
        <View className="mx-4 mt-4 bg-gray-900 rounded-2xl p-4">
          <View className="flex-row items-center mb-3">
            <Mic size={largeDisplayMode ? 22 : 20} color="#f97316" />
            <Text className={`text-gray-400 ml-2 ${largeDisplayMode ? 'text-lg' : 'text-base'}`}>Rep Counting Mode</Text>
          </View>

          <Pressable
            onPress={() => setRepCountingMode(repCountingMode === 'motion' ? 'voice' : 'motion')}
            className="flex-row items-center justify-between"
          >
            <View className="flex-1 mr-4">
              <Text className={`text-white ${largeDisplayMode ? 'text-lg' : 'text-base'}`}>Voice Counting</Text>
              <Text className={`text-gray-500 mt-1 ${largeDisplayMode ? 'text-sm' : 'text-xs'}`}>
                {repCountingMode === 'voice'
                  ? 'Say "1", "2", "3"... out loud to count reps'
                  : 'Turn on to count reps with your voice instead of auto-counting'}
              </Text>
            </View>
            <View
              className={`w-14 h-8 rounded-full items-center justify-center ${
                repCountingMode === 'voice' ? 'bg-orange-500' : 'bg-gray-700'
              }`}
            >
              <View
                className={`w-6 h-6 rounded-full bg-white absolute ${
                  repCountingMode === 'voice' ? 'right-1' : 'left-1'
                }`}
              />
            </View>
          </Pressable>

          {repCountingMode === 'motion' && (
            <View className="mt-3 bg-gray-800 rounded-xl px-3 py-2">
              <Text className={`text-gray-400 ${largeDisplayMode ? 'text-sm' : 'text-xs'}`}>
                Auto-counting is on — the accelerometer counts reps automatically. Toggle Voice Counting above to switch.
              </Text>
            </View>
          )}
        </View>

        {/* Motion Settings - only show when motion mode is active */}
        {repCountingMode === 'motion' && (
          <View className="mx-4 mt-4 bg-gray-900 rounded-2xl p-4">
            <View className="flex-row items-center mb-3">
              <Activity size={largeDisplayMode ? 22 : 20} color="#f97316" />
              <Text className={`text-gray-400 ml-2 ${largeDisplayMode ? 'text-lg' : 'text-base'}`}>Motion Sensitivity</Text>
            </View>

            <Text className={`text-gray-500 mb-3 ${largeDisplayMode ? 'text-sm' : 'text-xs'}`}>
              Adjust based on your exercise speed
            </Text>

            {(['low', 'medium', 'high'] as MotionSensitivity[]).map((level) => (
              <Pressable
                key={level}
                onPress={() => setMotionSensitivity(level)}
                className={`flex-row items-center justify-between py-3 px-3 rounded-lg mb-2 ${
                  motionSensitivity === level ? 'bg-orange-500/20 border border-orange-500' : 'bg-gray-800'
                }`}
              >
                <Text className={`${largeDisplayMode ? 'text-base' : 'text-sm'} ${
                  motionSensitivity === level ? 'text-orange-500 font-semibold' : 'text-white'
                }`}>
                  {SENSITIVITY_CONFIG[level].label}
                </Text>
                {motionSensitivity === level && (
                  <Check size={largeDisplayMode ? 20 : 18} color="#f97316" />
                )}
              </Pressable>
            ))}
          </View>
        )}

        {/* Pace Settings */}
        <View className="mx-4 mt-4 bg-gray-900 rounded-2xl p-4">
          <View className="flex-row items-center mb-3">
            <Timer size={largeDisplayMode ? 22 : 20} color="#f97316" />
            <Text className={`text-gray-400 ml-2 ${largeDisplayMode ? 'text-lg' : 'text-base'}`}>Pace Settings</Text>
          </View>

          <Text className={`text-gray-500 mb-2 ${largeDisplayMode ? 'text-sm' : 'text-xs'}`}>
            Configure your Pace-Setter Timer phases
          </Text>

          <View className="border-t border-gray-800 mt-2">
            <NumberStepper
              label="Delay to Start New Timer"
              value={paceSettings.delayToStart}
              min={0}
              max={15}
              onChange={(v) => updatePaceSetting('delayToStart', v)}
              isLarge={largeDisplayMode}
            />
            <View className="border-t border-gray-800" />
            <NumberStepper
              label="Lift Timer"
              value={paceSettings.liftTime}
              min={0}
              max={9}
              onChange={(v) => updatePaceSetting('liftTime', v)}
              isLarge={largeDisplayMode}
            />
            <View className="border-t border-gray-800" />
            <NumberStepper
              label="Hold at Top"
              value={paceSettings.holdTime}
              min={0}
              max={9}
              onChange={(v) => updatePaceSetting('holdTime', v)}
              isLarge={largeDisplayMode}
            />
            <View className="border-t border-gray-800" />
            <NumberStepper
              label="Down Timer"
              value={paceSettings.downTime}
              min={0}
              max={9}
              onChange={(v) => updatePaceSetting('downTime', v)}
              isLarge={largeDisplayMode}
            />
            <View className="border-t border-gray-800" />
            <NumberStepper
              label="Pause Time before Next Rep"
              value={paceSettings.pauseTime}
              min={0}
              max={9}
              onChange={(v) => updatePaceSetting('pauseTime', v)}
              isLarge={largeDisplayMode}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
