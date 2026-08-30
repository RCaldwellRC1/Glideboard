import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, Dimensions, Image, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ChevronLeft, LayoutPanelLeft, HelpCircle
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTheme, useSettingsStore, useTextScaleSubscription } from '@/lib/settings';
import { useCoachStore } from '@/lib/coach/store';
import { CoachTUTGauge } from '@/components/CoachTUTGauge';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function CoachReportScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const router = useRouter();
  const largeDisplayMode = useSettingsStore(s => s.largeDisplayMode);
  const textSize = useTextScaleSubscription();
  const fs = (base: number) => Math.round(base * (textSize === 'small' ? 0.85 : textSize === 'large' ? 1.15 : 1));

  const currentReport = useCoachStore(s => s.currentReport);
  const generateReportIfNeeded = useCoachStore(s => s.generateReportIfNeeded);

  useEffect(() => {
    generateReportIfNeeded();
  }, []);

  if (!currentReport) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }} className="items-center justify-center">
        <ActivityIndicator color="#f97316" size="large" />
        <Text style={{ color: theme.subText, marginTop: 12 }}>Generating your report...</Text>
      </View>
    );
  }

  const workoutsGradeColor = currentReport.workoutsGrade === 'A' ? '#22c55e' : currentReport.workoutsGrade === 'B' ? '#3b82f6' : '#f97316';

  const showGaugeHelp = () => {
    Alert.alert(
      "The Quality Gauge",
      "This dial measures your Average Pace (Seconds per Rep). Different speeds trigger different physiological adaptations:\n\n" +
      "• POWER (1.0 - 2.8s): Blue Zone. Focus on speed and force. Real-world: Jumping, sprinting, or explosive lifting. High Power output increases athletic reactivity and fast-twitch fiber activation.\n\n" +
      "• GROWTH (3.0 - 5.8s): Green Zone. The 'Hypertrophy' sweet spot. Science shows that moderate tempo creates optimal micro-tears in muscle fibers, leading to maximized muscle size, definition, and metabolic stress.\n\n" +
      "• CONTROL (6.0s+): Purple Zone. Maximize 'Time Under Tension'. Benefits include enhanced joint stability, neural drive, and muscle density. You're still building muscle, but with extreme safety and precision.",
      [{ text: "Got it" }]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ paddingTop: insets.top }} className="flex-row items-center justify-between px-4 py-2">
        <Pressable onPress={() => router.back()} className="active:opacity-60 p-2 -ml-2">
          <ChevronLeft size={32} color="#f97316" />
        </Pressable>
        <View className="items-center">
          <Image
            source={require('../../icon.png')}
            style={{ width: 28, height: 28, borderRadius: 6 }}
          />
          <Text style={{ color: theme.text }} className="font-black text-[8px] tracking-[0.3em] uppercase mt-1">GLIDEBOARD</Text>
        </View>
        <View className="w-10" />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
      >
        {/* Sticky Poster Header Wrapper */}
        <View style={{ backgroundColor: theme.background }}>
           <Text style={{ color: theme.text, fontSize: fs(18) }} className="font-black text-center py-2 uppercase tracking-[0.2em] opacity-40">Weekly Performance</Text>
        </View>

        {/* Report Card Poster */}
        <Animated.View
          entering={FadeIn.duration(600)}
          style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.25,
            shadowRadius: 20,
            elevation: 10,
          }}
          className="mx-3 mt-1 rounded-[40px] overflow-hidden"
        >
          <LinearGradient
            colors={theme.background === '#ffffff' ? ['#f9fafb', '#ffffff'] : ['#111827', '#000000']}
            className="p-5"
          >
            {/* Poster Header */}
            <View className="flex-row justify-between items-center mb-6">
              <View className="flex-1 mr-2">
                <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: theme.text, fontSize: fs(22) }} className="font-black italic tracking-tighter uppercase">Coach's Report</Text>
                <View className="flex-row items-center mt-0.5">
                  <View className="bg-orange-500 px-1.5 py-0.5 rounded-md mr-2">
                    <Text className="text-black font-black text-[8px]">8-WEEK ROLLING</Text>
                  </View>
                  <Text style={{ color: theme.subText }} className="text-[10px] font-bold uppercase tracking-widest">{currentReport.id}</Text>
                </View>
              </View>
              <View className="items-end pl-2">
                <Text style={{ color: theme.subText }} className="text-[7px] font-black uppercase opacity-60">OVERALL GRADE</Text>
                <Text style={{ color: workoutsGradeColor, fontSize: fs(38) }} className="font-black leading-none">{currentReport.workoutsGrade}</Text>
              </View>
            </View>

            {/* Workout Frequency */}
            <View style={{ backgroundColor: theme.background === '#ffffff' ? '#e5e7eb' : '#1f2937' }} className="rounded-3xl p-4 mb-4 flex-row items-center justify-between">
              <View className="flex-1 mr-4">
                <Text style={{ color: theme.text }} className="font-bold text-base">Workout Frequency</Text>
                <Text style={{ color: theme.subText }} className="text-[10px] mt-0.5 leading-4">Averaging <Text style={{ color: theme.text }} className="font-black">{currentReport.avgWorkoutsPerWeek.toFixed(1)}</Text> sessions per week.</Text>
              </View>
              <View className="items-center border-l border-gray-700/30 pl-4">
                <Text style={{ color: theme.subText }} className="text-[8px] font-black uppercase opacity-60">GRADE</Text>
                <Text style={{ color: workoutsGradeColor }} className="font-black text-xl leading-none">{currentReport.workoutsGrade}</Text>
              </View>
            </View>

            {/* Muscle Group Balance Header */}
            <View style={{ borderBottomColor: theme.divider }} className="border-b mb-4 pb-1 flex-row items-center justify-between">
               <Text style={{ color: theme.text }} className="font-black text-[10px] uppercase tracking-[0.2em] opacity-60">Body Balance & Quality</Text>
               <Pressable onPress={showGaugeHelp} className="p-1">
                 <HelpCircle size={18} color="#f97316" />
               </Pressable>
            </View>

            <View className="flex-row flex-wrap justify-between">
              {currentReport.categoryBreakdown.map((item) => (
                <View
                  key={item.category}
                  style={{ width: '48%', backgroundColor: theme.background === '#ffffff' ? '#f3f4f6' : '#111827', borderColor: theme.divider }}
                  className="rounded-2xl p-2.5 mb-2.5 border items-center shadow-sm"
                >
                  <Text numberOfLines={1} style={{ color: theme.text }} className="font-bold text-[10px] uppercase mb-4">{item.category}</Text>
                  <CoachTUTGauge averagePace={item.averagePace} isLarge={largeDisplayMode} />
                  <View className="flex-row mt-2.5 w-full justify-around border-t pt-1.5" style={{ borderTopColor: theme.divider }}>
                    <View className="items-center">
                      <Text style={{ color: theme.text }} className="font-black text-xs">{item.totalSets}</Text>
                      <Text style={{ color: theme.subText }} className="text-[7px] uppercase font-bold opacity-60">Sets</Text>
                    </View>
                    <View className="items-center">
                      <Text style={{ color: theme.text }} className="font-black text-xs">{item.totalReps}</Text>
                      <Text style={{ color: theme.subText }} className="text-[7px] uppercase font-bold opacity-60">Reps</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            {/* Core Snapshot */}
            <View style={{ backgroundColor: '#f9731608', borderColor: '#f9731620' }} className="rounded-3xl p-4 mt-2 border">
              <View className="flex-row items-center justify-between mb-1.5">
                <View className="flex-row items-center">
                  <LayoutPanelLeft size={16} color="#f97316" />
                  <Text className="text-orange-500 font-black text-base ml-2">CORE EXERCISES</Text>
                  <Pressable
                    onPress={() => Alert.alert("Core Goal", "The foundation of all strength. Target minimum 2 focused sets per week across various core exercises.")}
                    className="ml-2"
                  >
                    <HelpCircle size={14} color="#f97316" opacity={0.6} />
                  </Pressable>
                </View>
                <View className="items-end">
                  <Text className="text-orange-500/60 text-[8px] font-black uppercase">GRADE</Text>
                  <Text className="text-orange-500 font-black text-xl leading-none">{currentReport.coreGrade}</Text>
                </View>
              </View>
              <Text style={{ color: theme.text }} className="text-[11px] leading-5 italic opacity-80">"{currentReport.coreComment}"</Text>
              <View className="flex-row items-center mt-2.5">
                <View className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden mr-3">
                  <View
                    style={{ width: `${Math.min(100, (currentReport.coreSetsPerWeek / 2) * 100)}%` }}
                    className="h-full bg-orange-500 rounded-full"
                  />
                </View>
                <Text style={{ color: theme.subText }} className="text-[9px] font-bold">{currentReport.coreSetsPerWeek.toFixed(1)}/2.0 Weekly</Text>
              </View>
            </View>

            {/* Poster Footer */}
            <View className="items-center mt-6">
               <Text style={{ color: '#D4AF37' }} className="font-black text-[11px] tracking-[0.4em] uppercase shadow-sm">EVERY REP COUNTS</Text>
            </View>
          </LinearGradient>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
