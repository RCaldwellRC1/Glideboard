import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, ScrollView, Modal, Dimensions, Image, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ChevronLeft, Trophy, Target, Flame, Share2, Check, Clock,
  ArrowUpRight, ArrowDownRight, Minus, Sparkles, LayoutPanelLeft,
  ChevronRight, X
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown, SlideInBottom } from 'react-native-reanimated';
import { useTheme, useSettingsStore, useTextScaleSubscription } from '@/lib/settings';
import { useCoachStore } from '@/lib/coach/store';
import { CoachTUTGauge } from '@/components/CoachTUTGauge';
import { categoryColor } from '@/lib/workout';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const GOALS_TACTICAL = [
  { id: 'control', label: 'Control', desc: 'Slowing down reps for Growth.' },
  { id: 'balance', label: 'Balance', desc: 'Targeting weaker muscle groups.' },
  { id: 'frequency', label: 'Frequency', desc: 'Hitting more weekly sessions.' },
  { id: 'power', label: 'Power', desc: 'Increasing weight/intensity.' },
  { id: 'none', label: 'Maintenance', desc: 'No changes planned.' },
];

const GOALS_IDENTITY = [
  { id: 'spartan', label: 'Modern Spartan', desc: 'Athletic power & explosiveness.' },
  { id: 'sculptor', label: 'The Sculptor', desc: 'Muscle size & definition.' },
  { id: 'foundation', label: 'The Foundation', desc: 'Core strength & posture.' },
  { id: 'hybrid', label: 'The Hybrid', desc: 'A balanced athletic mix.' },
  { id: 'none', label: 'No Change', desc: 'Staying on current path.' },
];

export default function CoachReportScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const router = useRouter();
  const largeDisplayMode = useSettingsStore(s => s.largeDisplayMode);
  const textSize = useTextScaleSubscription();
  const fs = (base: number) => Math.round(base * (textSize === 'small' ? 0.85 : textSize === 'large' ? 1.15 : 1));

  const currentReport = useCoachStore(s => s.currentReport);
  const setGoals = useCoachStore(s => s.setGoals);
  const generateReportIfNeeded = useCoachStore(s => s.generateReportIfNeeded);

  const [showGoalModal, setShowGoalModal] = useState(false);
  const [tacticalGoal, setTacticalGoal] = useState<string | null>(null);
  const [identityGoal, setIdentityGoal] = useState<string | null>(null);

  useEffect(() => {
    generateReportIfNeeded();
  }, []);

  // Show goal modal only if goals aren't set for this report
  useEffect(() => {
    if (currentReport && !currentReport.goals) {
      const timer = setTimeout(() => setShowGoalModal(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [currentReport]);

  const handleSaveGoals = () => {
    if (!tacticalGoal || !identityGoal) {
      Alert.alert(
        "Selection Required",
        "Please select a 'Tactical Focus' and an 'Athlete Identity' to finalize your vision.",
        [{ text: "Got it" }]
      );
      return;
    }

    if (currentReport) {
      setGoals(currentReport.id, tacticalGoal, identityGoal);
      setShowGoalModal(false);
    }
  };

  if (!currentReport) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }} className="items-center justify-center">
        <Text style={{ color: theme.subText }}>Loading report...</Text>
      </View>
    );
  }

  const workoutsGradeColor = currentReport.workoutsGrade === 'A' ? '#22c55e' : currentReport.workoutsGrade === 'B' ? '#3b82f6' : '#f97316';

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-2">
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
          <Pressable className="active:opacity-60 p-2 -mr-2">
            <Share2 size={24} color={theme.subText} />
          </Pressable>
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
                <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: theme.text, fontSize: fs(24) }} className="font-black italic tracking-tighter">COACHES REPORT</Text>
                <View className="flex-row items-center mt-0.5">
                  <View className="bg-orange-500 px-1.5 py-0.5 rounded-md mr-2">
                    <Text className="text-black font-black text-[8px]">8-WEEK ROLLING</Text>
                  </View>
                  <Text style={{ color: theme.subText }} className="text-[10px] font-bold uppercase tracking-widest">{currentReport.id}</Text>
                </View>
              </View>
              <View className="items-end">
                <Text style={{ color: theme.subText }} className="text-[8px] font-black uppercase opacity-60">OVERALL</Text>
                <Text style={{ color: workoutsGradeColor, fontSize: fs(40) }} className="font-black leading-none">{currentReport.workoutsGrade}</Text>
              </View>
            </View>

            {/* Workout Frequency */}
            <View style={{ backgroundColor: theme.background === '#ffffff' ? '#e5e7eb' : '#1f2937' }} className="rounded-3xl p-4 mb-4 flex-row items-center justify-between">
              <View className="flex-1 mr-4">
                <Text style={{ color: theme.text }} className="font-bold text-base">Workout Frequency</Text>
                <Text style={{ color: theme.subText }} className="text-[10px] mt-0.5 leading-4">Averaging <Text style={{ color: theme.text }} className="font-black">{currentReport.avgWorkoutsPerWeek.toFixed(1)}</Text> sessions per week.</Text>
              </View>
              <View className="items-center border-l border-gray-700/30 pl-4">
                {currentReport.improvement.workouts !== 0 && (
                  <View className="flex-row items-center mb-0.5">
                    {currentReport.improvement.workouts > 0 ? <ArrowUpRight size={12} color="#22c55e" /> : <ArrowDownRight size={12} color="#ef4444" />}
                    <Text style={{ color: currentReport.improvement.workouts > 0 ? '#22c55e' : '#ef4444' }} className="text-[10px] font-black">{Math.abs(currentReport.improvement.workouts).toFixed(0)}%</Text>
                  </View>
                )}
                <Text style={{ color: theme.subText }} className="text-[8px] font-black uppercase opacity-60">GRADE</Text>
                <Text style={{ color: workoutsGradeColor }} className="font-black text-xl leading-none">{currentReport.workoutsGrade}</Text>
              </View>
            </View>

            {/* Muscle Group Balance */}
            <Text style={{ color: theme.text }} className="font-black text-[10px] uppercase tracking-[0.2em] mb-3 ml-1 opacity-60">Body Balance & Quality</Text>

            <View className="flex-row flex-wrap justify-between">
              {currentReport.categoryBreakdown.map((item) => (
                <View
                  key={item.category}
                  style={{ width: '48%', backgroundColor: theme.background === '#ffffff' ? '#f3f4f6' : '#111827', borderColor: theme.divider }}
                  className="rounded-2xl p-2.5 mb-2.5 border items-center"
                >
                  <Text numberOfLines={1} style={{ color: theme.text }} className="font-bold text-[10px] uppercase mb-2">{item.category}</Text>
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
                  <Text className="text-orange-500 font-black text-base ml-2">CORE FOUNDATION</Text>
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
            <View className="items-center mt-8 opacity-20">
               <Text style={{ color: theme.text }} className="font-black text-[10px] tracking-[0.4em] uppercase">EVERY REP COUNTS</Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Tactical Summary if Goals set */}
        {currentReport.goals && (
          <Animated.View entering={FadeInDown.delay(400)} style={{ backgroundColor: theme.card }} className="mx-4 mt-6 rounded-2xl p-5">
            <View className="flex-row items-center mb-4">
              <Sparkles size={20} color="#f97316" />
              <Text style={{ color: theme.text }} className="font-bold text-lg ml-2">8-Week Vision</Text>
            </View>
            <View className="flex-row mb-4">
              <View className="flex-1 bg-orange-500/10 p-3 rounded-xl mr-2">
                <Text style={{ color: theme.subText }} className="text-[10px] font-black uppercase">Tactical Focus</Text>
                <Text style={{ color: theme.text }} className="font-bold text-base mt-1">{GOALS_TACTICAL.find(g => g.id === currentReport.goals?.tactical)?.label}</Text>
              </View>
              <View className="flex-1 bg-orange-500/10 p-3 rounded-xl">
                <Text style={{ color: theme.subText }} className="text-[10px] font-black uppercase">Athlete Identity</Text>
                <Text style={{ color: theme.text }} className="font-bold text-base mt-1">{GOALS_IDENTITY.find(g => g.id === currentReport.goals?.identity)?.label}</Text>
              </View>
            </View>
            <Pressable onPress={() => setShowGoalModal(true)} className="items-center">
              <Text className="text-orange-500 font-bold text-xs uppercase tracking-widest underline">Update My Focus</Text>
            </Pressable>
          </Animated.View>
        )}
      </ScrollView>

      {/* Goal Questionnaire Modal */}
      <Modal visible={showGoalModal} transparent animationType="slide" onRequestClose={() => setShowGoalModal(false)}>
        <View style={{ paddingTop: insets.top }} className="flex-1 bg-black/80 justify-end">
          <Animated.View entering={SlideInBottom} style={{ backgroundColor: theme.card, paddingBottom: insets.bottom + 20 }} className="rounded-t-[40px] p-6">
            <View className="flex-row justify-between items-center mb-4">
              <View>
                <Text style={{ color: theme.text }} className="text-2xl font-black">Set Your Focus</Text>
                <Text style={{ color: theme.subText }} className="text-xs uppercase font-bold tracking-widest">Next 8-Week Vision</Text>
              </View>
              <Pressable onPress={() => setShowGoalModal(false)} className="bg-gray-800 p-2 rounded-full">
                <X size={20} color={theme.subText} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 450 }}>
              <View className="bg-orange-500/10 p-4 rounded-2xl mb-6 border border-orange-500/20">
                 <Text style={{ color: theme.text }} className="text-sm leading-5 font-medium italic">
                   "To maximize your Glideboard results, tell the Coach your primary goal for the next 8 weeks. We'll use this to tailor your future reports."
                 </Text>
              </View>

              {/* Question 1 */}
              <View className="flex-row items-center mb-4">
                <Target size={16} color="#f97316" />
                <Text style={{ color: theme.text }} className="font-black text-xs uppercase tracking-widest ml-2">1. Tactical Focus</Text>
              </View>
              {GOALS_TACTICAL.map((goal) => (
                <Pressable
                  key={goal.id}
                  onPress={() => setTacticalGoal(goal.id)}
                  style={{ backgroundColor: tacticalGoal === goal.id ? '#f9731615' : theme.background, borderColor: tacticalGoal === goal.id ? '#f97316' : theme.divider }}
                  className="p-4 rounded-2xl mb-2 border flex-row items-center"
                >
                  <View className="flex-1">
                    <Text style={{ color: tacticalGoal === goal.id ? '#f97316' : theme.text }} className="font-bold text-base">{goal.label}</Text>
                    <Text style={{ color: theme.subText }} className="text-xs mt-1">{goal.desc}</Text>
                  </View>
                  {tacticalGoal === goal.id && <Check size={20} color="#f97316" />}
                </Pressable>
              ))}

              {/* Question 2 */}
              <View className="flex-row items-center mt-6 mb-4">
                <Sparkles size={16} color="#f97316" />
                <Text style={{ color: theme.text }} className="font-black text-xs uppercase tracking-widest ml-2">2. Athlete Identity</Text>
              </View>
              {GOALS_IDENTITY.map((goal) => (
                <Pressable
                  key={goal.id}
                  onPress={() => setIdentityGoal(goal.id)}
                  style={{ backgroundColor: identityGoal === goal.id ? '#f9731615' : theme.background, borderColor: identityGoal === goal.id ? '#f97316' : theme.divider }}
                  className="p-4 rounded-2xl mb-2 border flex-row items-center"
                >
                  <View className="flex-1">
                    <Text style={{ color: identityGoal === goal.id ? '#f97316' : theme.text }} className="font-bold text-base">{goal.label}</Text>
                    <Text style={{ color: theme.subText }} className="text-xs mt-1">{goal.desc}</Text>
                  </View>
                  {identityGoal === goal.id && <Check size={20} color="#f97316" />}
                </Pressable>
              ))}
            </ScrollView>

            <Pressable
              onPress={handleSaveGoals}
              className={`mt-8 py-5 rounded-2xl items-center bg-orange-500 active:opacity-80`}
            >
              <Text className="text-white font-black text-lg">Save Focus</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}
