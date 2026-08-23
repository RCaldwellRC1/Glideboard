import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
// Remove SVG to prevent 'Svg doesn't exist' native crashes on this hardware
// import Svg, { Rect } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
  FadeIn,
  ZoomIn,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Trophy, Target, Flame, TrendingUp, ChevronDown, Ribbon, Medal, Crown, Clock, Sparkles, Star, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import {
  useWorkoutStore,
  formatTrophyDate,
  calculateCurrentStreak,
  getExercisePRDate,
  getFirstWorkoutDate,
  getRepMilestoneDate,
  getSessionsInWindowDate,
  getStreakEarnedDate,
  getWeeklyStreakEarnedDate,
  CATEGORY_COLORS,
} from '@/lib/workout';
import { useSettingsStore, useTextScaleSubscription, useTheme } from '@/lib/settings';
import { useCoachStore, medalTierForIndex, MEDAL_LABELS, MEDAL_COLORS, COACH_PROGRAMS, getProgramProgress, type CoachProgram } from '@/lib/coach';
import { remoteLog } from '@/lib/remoteLog';
import { PRChartModal } from '@/components/PRChartModal';

interface TrophyCardProps {
  icon: 'trophy' | 'target' | 'flame' | 'trending';
  title: React.ReactNode;
  description: string;
  earned: boolean;
  isLarge: boolean;
  // When earned, the date it was achieved (e.g. "Mar 12, 2026"). Shown in
  // orange under the description so users can see when they hit each milestone.
  dateLabel?: string | null;
  onPress?: () => void;
  isSelectable?: boolean;
}

function TrophyCard({ icon, title, description, earned, isLarge, dateLabel, onPress, isSelectable }: TrophyCardProps) {
  const theme = useTheme();
  const IconComponent = {
    trophy: Trophy,
    target: Target,
    flame: Flame,
    trending: TrendingUp,
  }[icon];

  const content = (
    <View
      style={{ backgroundColor: earned ? theme.card : `${theme.card}88`, borderColor: earned ? '#f97316' : theme.border, minHeight: isLarge ? 140 : 130 }}
      className={`flex-1 m-1.5 rounded-2xl p-3 items-center ${earned ? 'border-2' : 'border'}`}
    >
      <View
        className={`rounded-xl items-center justify-center mb-2 ${isLarge ? 'w-12 h-12' : 'w-10 h-10'}`}
        style={{ backgroundColor: earned ? 'rgba(249,115,22,0.1)' : theme.background }}
      >
        <IconComponent size={isLarge ? 24 : 20} color={earned ? '#f97316' : theme.subText} />
      </View>
      <Text
        style={{ color: earned ? theme.text : theme.subText }}
        className={`font-semibold text-center ${isLarge ? 'text-base' : 'text-sm'}`}
        numberOfLines={2}
      >
        {title}
      </Text>
      <Text
        style={{ color: earned ? theme.subText : `${theme.subText}88` }}
        className={`text-center mt-1 ${isLarge ? 'text-sm' : 'text-xs'}`}
        numberOfLines={2}
      >
        {description}
      </Text>
      {earned && dateLabel ? (
        <Text
          className={`text-orange-500/80 font-medium text-center mt-1 ${isLarge ? 'text-xs' : 'text-xs'}`}
          numberOfLines={1}
        >
          {dateLabel}
        </Text>
      ) : null}

      {isSelectable && (
        <View className="mt-1.5 flex-row items-center">
          <Sparkles size={10} color={earned ? "#f97316" : "#4b5563"} />
          <Text className={`text-[10px] ${earned ? 'text-orange-500/60' : 'text-gray-600'} font-bold ml-1 uppercase`}>
            {earned ? 'Share' : 'Goal'}
          </Text>
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} className="flex-1 active:opacity-80">
        {content}
      </Pressable>
    );
  }

  return content;
}

interface PRCardProps {
  exercise: string;
  level: number;
  isNew: boolean;
  isLarge: boolean;
  isCustom: boolean;
  dateLabel?: string | null;
}

// An Exercise PR card that plays a ~5 second celebratory "splash" the first
// time a newly earned PR is shown to the user.
function PRCard({ exercise, level, isNew, isLarge, isCustom, dateLabel }: PRCardProps) {
  const glow = useSharedValue(0);
  const scale = useSharedValue(1);
  const badge = useSharedValue(0);

  useEffect(() => {
    if (!isNew) return;

    // Quick pop, then a pulsing orange glow for 5 seconds.
    scale.value = withSequence(
      withTiming(1.06, { duration: 250 }),
      withTiming(1, { duration: 250 })
    );
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 550 }),
        withTiming(0.25, { duration: 550 })
      ),
      -1,
      true
    );
    badge.value = withTiming(1, { duration: 250 });

    const timer = setTimeout(() => {
      cancelAnimation(glow);
      glow.value = withTiming(0, { duration: 400 });
      badge.value = withTiming(0, { duration: 400 });
    }, 5000);

    return () => {
      clearTimeout(timer);
      cancelAnimation(glow);
    };
  }, [isNew]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  const badgeStyle = useAnimatedStyle(() => ({ opacity: badge.value }));

  return (
    <Animated.View style={containerStyle}>
      <TrophyCard
        icon="trending"
        title={
          <>
            {/* Custom (user-created) exercises show their name in green, matching
                the Tracker's exercise dropdown. "PR" stays the native color. */}
            <Text className={isCustom ? 'text-green-500' : undefined}>{exercise}</Text>
            {' PR'}
          </>
        }
        description={`Reached level ${level}`}
        earned={true}
        isLarge={isLarge}
        dateLabel={dateLabel}
      />
      {isNew && (
        <>
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: 6,
                left: 6,
                right: 6,
                bottom: 6,
                borderRadius: 16,
                borderWidth: 2,
                borderColor: '#f97316',
                backgroundColor: 'rgba(249,115,22,0.18)',
              },
              glowStyle,
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[{ position: 'absolute', top: 0, right: 0 }, badgeStyle]}
          >
            <View className="bg-orange-500 rounded-full px-2 py-0.5">
              <Text allowFontScaling={false} numberOfLines={1} className="text-white font-bold text-xs">✨ NEW PR</Text>
            </View>
          </Animated.View>
        </>
      )}
    </Animated.View>
  );
}

interface CollapsibleSectionProps {
  title: string;
  isLarge: boolean;
  expanded: boolean;
  onToggle: () => void;
  onMeasure: (y: number) => void;
  children: React.ReactNode;
}

// A trophies category whose body can be collapsed/expanded by tapping the
// header. Open/closed state is owned by the screen so only one section is open
// at a time (accordion), and the screen can keep the tapped header on screen
// when the content above/below changes height. The chevron rotates to indicate
// state.
function CollapsibleSection({ title, isLarge, expanded, onToggle, onMeasure, children }: CollapsibleSectionProps) {
  const theme = useTheme();
  const rotation = useSharedValue(expanded ? 1 : 0);

  useEffect(() => {
    rotation.value = withTiming(expanded ? 1 : 0, { duration: 200 });
  }, [expanded]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * 180}deg` }],
  }));

  return (
    <View className="mt-6" onLayout={e => onMeasure(e.nativeEvent.layout.y)}>
      <Pressable
        onPress={onToggle}
        className="flex-row items-center justify-between mx-4 mb-2 active:opacity-70"
      >
        <Text style={{ color: theme.text }} className={`font-bold ${isLarge ? 'text-xl' : 'text-lg'}`}>{title}</Text>
        <Animated.View style={chevronStyle}>
          <ChevronDown size={isLarge ? 26 : 22} color={theme.subText} />
        </Animated.View>
      </Pressable>
      {expanded && <View>{children}</View>}
    </View>
  );
}

// A single Coach's Routine completion trophy — its icon and color reflect the
// tier earned (Ribbon → Bronze → Silver → Gold → Mr. Olympia), and it shows the
// date the routine was completed.
function CoachTrophyCard({
  index, completedAt, isLarge, onPress,
}: { index: number; completedAt: string; isLarge: boolean; onPress: () => void }) {
  const tier = medalTierForIndex(index);
  const color = MEDAL_COLORS[tier];
  const isFinale = tier === 'olympia';
  const IconComponent = tier === 'ribbon' ? Ribbon : tier === 'olympia' ? Crown : tier === 'gold' ? Trophy : Medal;

  const dateLabel = new Date(completedAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 m-1.5 rounded-2xl p-3 items-center border-2 bg-gray-900 active:opacity-70`}
      style={{ minHeight: isLarge ? 140 : 130, borderColor: isFinale ? '#fde047' : color }}
    >
      <View
        className={`rounded-xl items-center justify-center mb-2 ${isLarge ? 'w-12 h-12' : 'w-10 h-10'}`}
        style={{ backgroundColor: isFinale ? 'rgba(253,224,71,0.18)' : 'rgba(255,255,255,0.06)' }}
      >
        <IconComponent size={isLarge ? 26 : 22} color={color} />
      </View>
      <Text className={`font-semibold text-center ${isLarge ? 'text-base' : 'text-sm'} text-white`} numberOfLines={2}>
        {isFinale ? 'Mr. Olympia' : `${MEDAL_LABELS[tier]}`}
      </Text>
      <Text className={`text-center mt-1 ${isLarge ? 'text-sm' : 'text-xs'} text-gray-400`} numberOfLines={1}>
        Session #{index}
      </Text>
      <Text className={`text-center mt-0.5 ${isLarge ? 'text-xs' : 'text-xs'} text-gray-600`} numberOfLines={1}>
        {dateLabel}
      </Text>
      <Text className={`text-center mt-1 ${isLarge ? 'text-xs' : 'text-xs'}`} style={{ color }} numberOfLines={1}>
        View summary →
      </Text>
    </Pressable>
  );
}

// The premium "you finished the whole program" trophy. Bigger and flashier
// than the per-session medals: full width, a gold gradient, a glowing crown
// that gently pulses, and a "Next Level Unlocked" flourish. Only rendered once
// the program is actually complete, so users never see it before they earn it.
function ProgramChampionCard({
  program, completedAt, isLarge, onPress,
}: { program: CoachProgram; completedAt: string | null; isLarge: boolean; onPress: () => void }) {
  const glow = useSharedValue(0);
  const crownScale = useSharedValue(1);

  useEffect(() => {
    glow.value = withRepeat(withTiming(1, { duration: 1400 }), -1, true);
    crownScale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 900 }),
        withTiming(1, { duration: 900 }),
      ),
      -1,
      true,
    );
    return () => {
      cancelAnimation(glow);
      cancelAnimation(crownScale);
    };
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + glow.value * 0.45,
    transform: [{ scale: 1 + glow.value * 0.35 }],
  }));
  const crownStyle = useAnimatedStyle(() => ({ transform: [{ scale: crownScale.value }] }));

  const dateLabel = completedAt
    ? new Date(completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <Pressable onPress={onPress} className="mx-3 mb-4 active:opacity-90">
      <View
        className="rounded-3xl overflow-hidden"
        style={{ borderWidth: 2, borderColor: '#fde047', shadowColor: '#fbbf24', shadowOpacity: 0.6, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10 }}
      >
        <LinearGradient
          colors={['#1a1405', '#7a5c12', '#d4af37']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ padding: isLarge ? 18 : 22 }}
        >
          <View className="flex-row items-center">
            {/* Glowing crown */}
            <View className={`items-center justify-center mr-4 ${isLarge ? 'w-16 h-16' : 'w-20 h-20'}`}>
              <Animated.View
                pointerEvents="none"
                style={[
                  { position: 'absolute', width: '100%', height: '100%', borderRadius: 999, backgroundColor: '#fde047' },
                  glowStyle,
                ]}
              />
              <View
                className={`rounded-full items-center justify-center ${isLarge ? 'w-14 h-14' : 'w-16 h-16'}`}
                style={{ backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1.5, borderColor: 'rgba(253,224,71,0.7)' }}
              >
                <Animated.View style={crownStyle}>
                  <Crown size={isLarge ? 30 : 36} color="#fff8dc" fill="#fde047" />
                </Animated.View>
              </View>
            </View>

            <View className="flex-1">
              <View className="flex-row items-center">
                <Sparkles size={isLarge ? 13 : 15} color="#fff8dc" />
                <Text className={`text-yellow-100 font-bold ml-1 tracking-widest ${isLarge ? 'text-xs' : 'text-sm'}`}>
                  PROGRAM CHAMPION
                </Text>
              </View>
              <Text className={`text-white font-extrabold mt-1 ${isLarge ? 'text-lg' : 'text-2xl'}`} numberOfLines={2}>
                {program.title}
              </Text>
              <Text className={`text-yellow-100/90 mt-0.5 ${isLarge ? 'text-xs' : 'text-sm'}`} numberOfLines={1}>
                Full 4-week program complete
              </Text>
              {dateLabel && (
                <Text className={`text-white font-semibold mt-1 ${isLarge ? 'text-xs' : 'text-sm'}`} numberOfLines={1}>
                  Completed {dateLabel}
                </Text>
              )}
            </View>
          </View>

          {/* Footer: unlock flourish */}
          <View className="flex-row items-center mt-4">
            <View
              className="flex-row items-center rounded-full px-3 py-1.5"
              style={{ backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1, borderColor: 'rgba(253,224,71,0.6)' }}
            >
              <Star size={isLarge ? 12 : 14} color="#fde047" fill="#fde047" />
              <Text className={`text-yellow-100 font-bold ml-1.5 ${isLarge ? 'text-xs' : 'text-sm'}`}>
                Next Level Unlocked
              </Text>
            </View>
          </View>
        </LinearGradient>
      </View>
    </Pressable>
  );
}

function fmtHold(total: number): string {
  if (total >= 60) {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  return `${total}s`;
}

// Full-screen pop-out for trophies to make them shareable on social media.
// Full-screen pop-out for trophies to make them shareable on social media.
function FullScreenTrophyModal({
  trophy,
  onClose
}: {
  trophy: TrophyCardProps | null;
  onClose: () => void;
}) {
  if (!trophy) return null;

  const IconComponent = {
    trophy: Trophy,
    target: Target,
    flame: Flame,
    trending: TrendingUp,
  }[trophy.icon] || Trophy;

  // Premium Luster Palette
  const goldDark = '#856A1B';
  const goldBase = '#D4AF37';
  const goldBright = '#FDB931';
  const goldHighlight = '#FFF9E3';

  // Rotating animation for the halo
  const rotation = useSharedValue(0);
  useEffect(() => {
    if (trophy.earned) {
      rotation.value = withRepeat(withTiming(360, { duration: 45000 }), -1, false);
    } else {
      rotation.value = 0;
    }
  }, [trophy.earned]);

  const rotateStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 100 }]} className="items-center justify-center p-4">
      <Animated.View entering={FadeIn.duration(300)} style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
      </Animated.View>

      {/* Outer Border Gradient Wrapper */}
      <Animated.View
        entering={ZoomIn.duration(400).springify().damping(20)}
        className="w-full max-w-sm aspect-[4/4.5] rounded-[40px] overflow-hidden shadow-2xl p-[2.5px]"
        style={{
          backgroundColor: trophy.earned ? goldBase : '#4b5563',
          shadowColor: trophy.earned ? goldBase : '#000',
          shadowOpacity: 0.9,
          shadowRadius: 40,
          elevation: 25,
        }}
      >
        {trophy.earned && (
           <LinearGradient
            colors={[goldDark, goldHighlight, goldBase, goldHighlight, goldDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}

        {/* Main Card Content */}
        <View className="flex-1 rounded-[37px] overflow-hidden bg-black">
          {trophy.earned ? (
            <LinearGradient
              colors={['#1a1405', '#000', '#1a1405']}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />
          )}

          {/* Top Header Section */}
          <View className="p-4 pb-0 mt-0.5">
            <View className="flex-row items-center justify-center relative h-10">
              {/* Logo in top-left */}
              <View className="absolute left-1">
                <Image
                  source={require('../../../icon.png')}
                  style={{ width: 30, height: 30, borderRadius: 8 }}
                  contentFit="contain"
                />
              </View>

              {/* Achievement Pill in top-center */}
              <View style={{ borderRadius: 999, padding: 1, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                <LinearGradient
                   colors={trophy.earned ? [goldDark, goldHighlight, goldDark] : ['#333', '#444']}
                   start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                   style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 }}
                >
                  <Text style={{ color: '#000', fontWeight: '900', fontSize: 7.5, letterSpacing: 1, textAlign: 'center' }}>
                    {trophy.earned ? 'OFFICIAL ACHIEVEMENT' : 'GOAL LOCKED'}
                  </Text>
                </LinearGradient>
              </View>
            </View>
          </View>

          <View className="flex-1 items-center justify-center px-6">
            {/* Trophy inside a Premium Halo - scaled down for fit */}
            <View className="items-center justify-center mb-2">
              {trophy.earned && (
                <>
                   {/* Layered soft halos for depth */}
                   <View style={{ position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: goldBase, opacity: 0.02 }} />
                   <View style={{ position: 'absolute', width: 170, height: 170, borderRadius: 85, backgroundColor: goldBright, opacity: 0.04 }} />

                   <Animated.View style={[{ position: 'absolute' }, rotateStyle]}>
                      <View
                        style={{
                          width: 150,
                          height: 150,
                          borderRadius: 75,
                          borderWidth: 1.2,
                          borderColor: goldBase,
                          opacity: 0.2,
                          borderStyle: 'dashed'
                        }}
                      />
                   </Animated.View>
                </>
              )}

              <View
                className="w-32 h-32 rounded-full items-center justify-center border-2"
                style={{
                  borderColor: trophy.earned ? goldBase : '#222',
                  backgroundColor: 'rgba(10, 10, 10, 0.8)',
                  shadowColor: trophy.earned ? goldBright : '#000',
                  shadowOpacity: 0.3,
                  shadowRadius: 10,
                }}
              >
                <IconComponent
                  size={55}
                  color={trophy.earned ? goldHighlight : '#4b5563'}
                  fill={trophy.earned ? goldBase : 'transparent'}
                  strokeWidth={1.5}
                />
              </View>
            </View>

            <Text adjustsFontSizeToFit numberOfLines={1} className={`${trophy.earned ? 'text-white' : 'text-gray-500'} font-black text-xl text-center mb-0.5 uppercase tracking-tight`}>
              {trophy.title}
            </Text>

            <Text adjustsFontSizeToFit numberOfLines={2} className={`${trophy.earned ? 'text-gray-400' : 'text-gray-700'} text-base text-center font-bold px-6 mb-3 italic`}>
              {trophy.description}
            </Text>

            {/* Earned Pill with Metallic Border - compact */}
            {trophy.earned && trophy.dateLabel && (
               <View style={{ borderRadius: 999, padding: 1, backgroundColor: 'rgba(255,255,255,0.12)' }}>
                  <LinearGradient
                    colors={['#1a1405', '#000']}
                    style={{ paddingHorizontal: 20, paddingVertical: 5, borderRadius: 999 }}
                  >
                    <Text className="text-white font-black text-xs uppercase">
                       EARNED {trophy.dateLabel}
                    </Text>
                  </LinearGradient>
               </View>
            )}
          </View>

          {/* Footer Branding - scaled down */}
          <View className="items-center pb-6 px-10">
             <Text numberOfLines={1} adjustsFontSizeToFit className="text-[#D4AF37] font-black text-xl tracking-[0.2em] uppercase italic" style={{ shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 2, elevation: 5 }}>
                GLIDEBOARD
             </Text>
             {/* Dynamic Horizontal Line */}
             <LinearGradient
                colors={['transparent', goldBase, goldHighlight, goldBase, 'transparent']}
                start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
                style={{ height: 1.5, width: '100%', marginTop: 6, opacity: 0.5 }}
             />
          </View>

          {/* Decorative Sparkles using Lucide icons */}
          {trophy.earned && (
            <>
              <View className="absolute bottom-20 left-6">
                <Sparkles size={16} color={goldBright} opacity={0.5} />
              </View>
              <View className="absolute top-40 right-6">
                <Sparkles size={18} color={goldHighlight} opacity={0.5} />
              </View>
            </>
          )}
        </View>
      </Animated.View>

      <Pressable
        onPress={onClose}
        className="mt-6 bg-gray-900 w-14 h-14 rounded-full items-center justify-center active:bg-gray-800 border-2 border-gray-700 shadow-lg"
      >
        <X size={28} color="#fff" />
      </Pressable>

      <Text className="text-gray-500 mt-4 text-xs font-bold uppercase tracking-[0.3em]">Tap anywhere to dismiss</Text>
    </View>
  );
}

// A Timed-hold PR card — the exercise name and accents use the Timed category's
// purple, and it shows the best hold time achieved.
function TimedTrophyCard({
  exercise, seconds, dateLabel, isLarge,
}: { exercise: string; seconds: number; dateLabel?: string | null; isLarge: boolean }) {
  const color = CATEGORY_COLORS.timed;
  return (
    <View
      className="flex-1 m-1.5 rounded-2xl p-3 items-center bg-gray-900"
      style={{ minHeight: isLarge ? 140 : 130, borderWidth: 2, borderColor: color }}
    >
      <View
        className={`rounded-xl items-center justify-center mb-2 ${isLarge ? 'w-12 h-12' : 'w-10 h-10'}`}
        style={{ backgroundColor: 'rgba(168,85,247,0.18)' }}
      >
        <Clock size={isLarge ? 24 : 20} color={color} />
      </View>
      <Text className={`font-semibold text-center ${isLarge ? 'text-base' : 'text-sm'}`} style={{ color }} numberOfLines={2}>
        {exercise}
      </Text>
      <Text className={`text-center mt-1 ${isLarge ? 'text-sm' : 'text-xs'} text-gray-300`} numberOfLines={1}>
        Best time {fmtHold(seconds)}
      </Text>
      {dateLabel ? (
        <Text className={`font-medium text-center mt-1 text-xs`} style={{ color: `${color}cc` }} numberOfLines={1}>
          {dateLabel}
        </Text>
      ) : null}
    </View>
  );
}

// Achievements screen: trophies, rep milestones, and tappable Exercise PR
// cards that pop out a progress chart.
export default function TrophiesScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const router = useRouter();
  const workoutHistory = useWorkoutStore(s => s.workoutHistory);
  const exerciseHistory = useWorkoutStore(s => s.exerciseHistory);
  const seenPRs = useWorkoutStore(s => s.seenPRs);
  const markPRsSeen = useWorkoutStore(s => s.markPRsSeen);
  const customExercises = useWorkoutStore(s => s.customExercises);
  const largeDisplayMode = useSettingsStore(s => s.largeDisplayMode);
  useTextScaleSubscription(); // re-render when global text size changes
  const loadSettings = useSettingsStore(s => s.loadFromStorage);

  const coachCompletions = useCoachStore(s => s.completions);
  const loadCoach = useCoachStore(s => s.loadFromStorage);

  // Programs the user has fully finished — each earns the premium champion
  // trophy. Only complete ones are surfaced (never shown before earned).
  const completedPrograms = useMemo(
    () =>
      COACH_PROGRAMS
        .map(program => ({ program, progress: getProgramProgress(program, coachCompletions) }))
        .filter(x => x.progress.complete),
    [coachCompletions],
  );

  // The exercise whose progress chart is popped open (null when closed).
  const [chartExercise, setChartExercise] = useState<string | null>(null);

  // The trophy card expanded to full screen for sharing (null when closed).
  const [expandedTrophy, setExpandedTrophy] = useState<TrophyCardProps | null>(null);

  const handleTrophyPress = useCallback((props: TrophyCardProps) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setExpandedTrophy(props);
    remoteLog('trophy_expanded', { title: String(props.title) });
  }, []);

  // Only one trophies section is open at a time. Opening a new one closes the
  // previous, and we scroll the tapped header back to the top of the screen so
  // changing section heights can never leave the user staring at blank space
  // below the content.
  const [openSection, setOpenSection] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const sectionTops = useRef<Record<string, number>>({});

  const toggleSection = (key: string) => {
    setOpenSection(prev => (prev === key ? null : key));
    // Wait for the collapse/expand to lay out before scrolling.
    setTimeout(() => {
      const y = sectionTops.current[key];
      if (y == null) return;
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
    }, 80);
  };

  const sectionProps = (key: string) => ({
    expanded: openSection === key,
    onToggle: () => toggleSection(key),
    onMeasure: (y: number) => {
      sectionTops.current[key] = y;
    },
  });

  useEffect(() => {
    loadSettings();
    loadCoach();
  }, []);

  useEffect(() => {
    if (workoutHistory.length === 0 && exerciseHistory.length === 0) return;
    remoteLog('trophies_viewed', {
      totalWorkouts: workoutHistory.length,
      totalReps: workoutHistory.reduce((s, w) => s + w.sets.reduce((ss, set) => ss + set.reps, 0), 0),
      exercisesAttempted: exerciseHistory.length,
      exercisePRs: exerciseHistory.map(h => ({ exercise: h.exercise, incline: h.inclineLevel, bestReps: h.bestReps })),
    });
  }, [workoutHistory.length]);

  // Calculate stats
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalReps = workoutHistory.reduce(
      (sum, w) => sum + w.sets.reduce((s, set) => s + set.reps, 0),
      0
    );

    // Calculate current streak.
    const streak = calculateCurrentStreak(workoutHistory);

    // Workouts in the last 7 days (rolling window).
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    const workoutsThisWeek = workoutHistory.filter(w => {
      const d = new Date(w.date);
      return d >= sevenDaysAgo;
    }).length;

    // Keep the calendar-week start for the weekly-streak calculation below.
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const currentWeekStart = startOfWeek.getTime();
    const weekStartOf = (date: string | number | Date) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - d.getDay());
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    };
    // Index 0 = current week, 1 = last week, 2 = two weeks ago, ...
    const weekCounts = new Map<number, number>();
    workoutHistory.forEach(w => {
      const idx = Math.round((currentWeekStart - weekStartOf(w.date)) / msPerWeek);
      if (idx >= 0) weekCounts.set(idx, (weekCounts.get(idx) ?? 0) + 1);
    });
    let weeklyStreak = 0;
    let wi = 1; // start from the most recent completed week
    while ((weekCounts.get(wi) ?? 0) >= 3) {
      weeklyStreak++;
      wi++;
    }

    return { totalReps, streak, workoutsThisWeek, weeklyStreak };
  }, [workoutHistory]);

  // Trophy shelf achievements. The `dateLabel` is the date the trophy was
  // earned, derived from workout history (only shown when earned).
  const trophyShelf = useMemo(() => {
    const dateFor = (d: Date | null) => (d ? formatTrophyDate(d) : null);
    return [
      {
        icon: 'trophy' as const,
        title: 'First Workout',
        description: 'Complete your first workout',
        earned: workoutHistory.length >= 1,
        dateLabel: dateFor(getFirstWorkoutDate(workoutHistory)),
      },
      {
        icon: 'target' as const,
        title: '3 Workouts in a Week',
        description: 'Train 3 times in one week',
        earned: stats.workoutsThisWeek >= 3,
        dateLabel: dateFor(getSessionsInWindowDate(workoutHistory, 3, 7)),
      },
      {
        icon: 'flame' as const,
        title: '7 Day Streak',
        description: 'Workout for 7 consecutive days',
        earned: stats.streak >= 7,
        dateLabel: dateFor(getStreakEarnedDate(workoutHistory, 7)),
      },
      {
        icon: 'trending' as const,
        title: 'One Month Weekly Streak',
        description: 'Hit a 4 week weekly streak',
        earned: stats.weeklyStreak >= 4,
        dateLabel: dateFor(getWeeklyStreakEarnedDate(workoutHistory, 4)),
      },
      {
        icon: 'trending' as const,
        title: 'Two Months Weekly Streak',
        description: 'Hit an 8 week weekly streak',
        earned: stats.weeklyStreak >= 8,
        dateLabel: dateFor(getWeeklyStreakEarnedDate(workoutHistory, 8)),
      },
    ];
  }, [workoutHistory, stats.workoutsThisWeek, stats.streak, stats.weeklyStreak]);

  // Rep milestones. `dateLabel` is the date cumulative reps first crossed the
  // target (only shown when earned).
  const repMilestones = useMemo(() => {
    return [100, 500, 1000, 2000, 5000, 7500, 10000, 15000, 20000].map(reps => {
      const earned = stats.totalReps >= reps;
      const date = earned ? getRepMilestoneDate(workoutHistory, reps) : null;
      return { reps, earned, dateLabel: date ? formatTrophyDate(date) : null };
    });
  }, [workoutHistory, stats.totalReps]);

  // Set of user-created exercise names (across all groups), so we can render
  // their PR titles in green — matching the Tracker's exercise dropdown.
  const customExerciseNames = useMemo(
    () => new Set(Object.values(customExercises).flat()),
    [customExercises]
  );

  // Exercise PRs - group by exercise name, track highest level reached
  const exercisePRs = useMemo(() => {
    const prMap = new Map<string, number>();
    exerciseHistory.forEach(h => {
      const current = prMap.get(h.exercise) ?? 0;
      if (h.inclineLevel > current) {
        prMap.set(h.exercise, h.inclineLevel);
      }
    });
    return Array.from(prMap.entries()).map(([exercise, level]) => {
      const date = getExercisePRDate(workoutHistory, exercise, level);
      return {
        exercise,
        level,
        dateLabel: date ? formatTrophyDate(date) : null,
      };
    });
  }, [exerciseHistory, workoutHistory]);

  // Timed-hold PRs — best held seconds per Timed exercise, derived from the
  // timed sets in workout history. Shown in the Timed category's purple.
  const timedPRs = useMemo(() => {
    const best = new Map<string, { seconds: number; date: Date }>();
    workoutHistory.forEach(w => {
      w.sets.forEach(s => {
        if (s.kind !== 'timed') return;
        const secs = s.durationSeconds ?? 0;
        const prev = best.get(s.exercise);
        if (!prev || secs > prev.seconds) {
          best.set(s.exercise, { seconds: secs, date: new Date(w.date) });
        }
      });
    });
    return Array.from(best.entries())
      .map(([exercise, v]) => ({ exercise, seconds: v.seconds, date: v.date }))
      .sort((a, b) => b.seconds - a.seconds);
  }, [workoutHistory]);

  // Determine which PRs are brand new (never shown before) so we can splash
  // them for ~5 seconds. Each new PR is marked seen immediately so the reward
  // only ever plays the first time the user views it.
  const [splashKeys, setSplashKeys] = useState<string[]>([]);
  const splashedRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (exercisePRs.length === 0) return;

    const newKeys = exercisePRs
      .map(pr => `${pr.exercise}::${pr.level}`)
      .filter(key => !seenPRs.includes(key) && !splashedRef.current.has(key));

    if (newKeys.length === 0) return;

    newKeys.forEach(k => splashedRef.current.add(k));
    setSplashKeys(prev => [...prev, ...newKeys]);
    markPRsSeen(newKeys);

    // Intentionally not cleared on effect re-run: marking PRs seen updates
    // `seenPRs` and re-triggers this effect, which would otherwise cancel the
    // splash timer early.
    setTimeout(() => {
      if (mountedRef.current) {
        setSplashKeys(prev => prev.filter(k => !newKeys.includes(k)));
      }
    }, 5200);
  }, [exercisePRs, seenPRs]);

  // Count earned trophies
  const earnedCount =
    trophyShelf.filter(t => t.earned).length +
    repMilestones.filter(m => m.earned).length +
    exercisePRs.length +
    timedPRs.length +
    coachCompletions.length;

  return (
    <>
    <ScrollView
      ref={scrollRef}
      style={{ backgroundColor: theme.background }}
      className="flex-1"
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 100 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View className="items-center mt-4">
        <Text className={largeDisplayMode ? 'text-4xl' : 'text-5xl'}>🏆</Text>
        <Text style={{ color: theme.text }} className={`font-bold mt-2 ${largeDisplayMode ? 'text-2xl' : 'text-3xl'}`}>Achievements</Text>
        <Text style={{ color: theme.subText }} className={`mt-1 ${largeDisplayMode ? 'text-base' : 'text-sm'}`}>{earnedCount} trophies earned</Text>
      </View>

      {/* Your Stats Card */}
      <View style={{ backgroundColor: theme.card }} className="mx-4 mt-6 rounded-2xl p-4">
        <Text style={{ color: theme.subText }} className={`mb-3 ${largeDisplayMode ? 'text-xl' : 'text-lg'}`}>Your Stats</Text>
        <View className="flex-row justify-between items-center py-2">
          <Text numberOfLines={1} style={{ color: theme.text }} className={`flex-shrink mr-2 ${largeDisplayMode ? 'text-lg' : 'text-base'}`}>Total Reps</Text>
          <Text numberOfLines={1} className={`text-orange-500 font-bold flex-shrink-0 ${largeDisplayMode ? 'text-xl' : 'text-lg'}`}>{stats.totalReps}</Text>
        </View>
        <View className="flex-row justify-between items-center py-2">
          <Text numberOfLines={1} style={{ color: theme.text }} className={`flex-shrink mr-2 ${largeDisplayMode ? 'text-lg' : 'text-base'}`}>Current Streak</Text>
          <Text numberOfLines={1} className={`text-orange-500 font-bold flex-shrink-0 ${largeDisplayMode ? 'text-xl' : 'text-lg'}`}>{stats.streak} days</Text>
        </View>
        <View className="flex-row justify-between items-center py-2">
          <Text numberOfLines={1} style={{ color: theme.text }} className={`flex-shrink mr-2 ${largeDisplayMode ? 'text-lg' : 'text-base'}`}>Weekly Streak</Text>
          <Text numberOfLines={1} className={`text-orange-500 font-bold flex-shrink-0 ${largeDisplayMode ? 'text-xl' : 'text-lg'}`}>
            {stats.weeklyStreak} {stats.weeklyStreak === 1 ? 'week' : 'weeks'}
          </Text>
        </View>
        <View className="flex-row justify-between items-center py-2">
          <Text numberOfLines={1} style={{ color: theme.text }} className={`flex-shrink mr-2 ${largeDisplayMode ? 'text-lg' : 'text-base'}`}>Workouts This Week</Text>
          <Text numberOfLines={1} className={`text-orange-500 font-bold flex-shrink-0 ${largeDisplayMode ? 'text-xl' : 'text-lg'}`}>{stats.workoutsThisWeek}</Text>
        </View>
      </View>

      {/* Trophy Shelf */}
      <CollapsibleSection title="Trophy Shelf" isLarge={largeDisplayMode} {...sectionProps('shelf')}>
        <View className="flex-row flex-wrap px-2">
          {trophyShelf.map((trophy, index) => (
            <View key={index} className="w-1/2">
              <TrophyCard
                {...trophy}
                isLarge={largeDisplayMode}
                isSelectable={true}
                onPress={() => handleTrophyPress({ ...trophy, isLarge: largeDisplayMode })}
              />
            </View>
          ))}
        </View>
      </CollapsibleSection>

      {/* Rep Milestones */}
      <CollapsibleSection title="Rep Milestones" isLarge={largeDisplayMode} {...sectionProps('reps')}>
        <View className="flex-row flex-wrap px-2">
          {repMilestones.map((milestone, index) => {
            const trophyProps: TrophyCardProps = {
              icon: 'trophy',
              title: `${milestone.reps.toLocaleString()} Total Reps`,
              description: `Reach ${milestone.reps.toLocaleString()} total reps`,
              earned: milestone.earned,
              isLarge: largeDisplayMode,
              dateLabel: milestone.dateLabel,
            };
            return (
              <View key={index} className="w-1/2">
                <TrophyCard
                  {...trophyProps}
                  isSelectable={true}
                  onPress={() => handleTrophyPress(trophyProps)}
                />
              </View>
            );
          })}
        </View>
      </CollapsibleSection>

      {/* Exercise PRs */}
      {exercisePRs.length > 0 && (
        <CollapsibleSection title="Exercise PRs" isLarge={largeDisplayMode} {...sectionProps('prs')}>
          <View className="flex-row flex-wrap px-2">
            {exercisePRs.map((pr, index) => (
              <View key={index} className="w-1/2">
                <Pressable
                  onPress={() => {
                    setChartExercise(pr.exercise);
                    remoteLog('pr_chart_opened', { exercise: pr.exercise, level: pr.level });
                  }}
                  className="active:opacity-80"
                >
                  <PRCard
                    exercise={pr.exercise}
                    level={pr.level}
                    isNew={splashKeys.includes(`${pr.exercise}::${pr.level}`)}
                    isLarge={largeDisplayMode}
                    isCustom={customExerciseNames.has(pr.exercise)}
                    dateLabel={pr.dateLabel}
                  />
                </Pressable>
              </View>
            ))}
          </View>
        </CollapsibleSection>
      )}

      {/* Timed Holds — best hold per Timed exercise (purple) */}
      {timedPRs.length > 0 && (
        <CollapsibleSection title="Timed" isLarge={largeDisplayMode} {...sectionProps('timed')}>
          <View className="flex-row flex-wrap px-2">
            {timedPRs.map((pr) => (
              <View key={pr.exercise} className="w-1/2">
                <TimedTrophyCard
                  exercise={pr.exercise}
                  seconds={pr.seconds}
                  dateLabel={formatTrophyDate(pr.date)}
                  isLarge={largeDisplayMode}
                />
              </View>
            ))}
          </View>
        </CollapsibleSection>
      )}

      {/* Coach's Routines — one trophy per completed routine session */}
      <CollapsibleSection title="Coach's Routines" isLarge={largeDisplayMode} {...sectionProps('coach')}>
        {/* Premium program-completion trophies (only shown once earned) */}
        {completedPrograms.map(({ program, progress }) => (
          <ProgramChampionCard
            key={program.id}
            program={program}
            completedAt={progress.completedAt}
            isLarge={largeDisplayMode}
            onPress={() => router.push(`/coach-program?id=${program.id}`)}
          />
        ))}

        {coachCompletions.length === 0 ? (
          <View className="mx-4 bg-gray-900 rounded-2xl p-4 items-center">
            <Text className={`text-gray-500 text-center ${largeDisplayMode ? 'text-base' : 'text-sm'}`}>
              Complete a Coach's Routine to earn your first trophy.
            </Text>
          </View>
        ) : (
          <View className="flex-row flex-wrap px-2">
            {[...coachCompletions].reverse().map((c) => (
              <View key={`${c.routineId}-${c.index}`} className="w-1/2">
                <CoachTrophyCard
                  index={c.index}
                  completedAt={c.completedAt}
                  isLarge={largeDisplayMode}
                  onPress={() =>
                    router.push({
                      pathname: '/workout-summary',
                      params: {
                        routineId: c.routineId,
                        index: String(c.index),
                        completedAt: c.completedAt,
                        ...(c.workoutId ? { workoutId: c.workoutId } : {}),
                      },
                    })
                  }
                />
              </View>
            ))}
          </View>
        )}
      </CollapsibleSection>
    </ScrollView>

    <PRChartModal exercise={chartExercise} onClose={() => setChartExercise(null)} />
    <FullScreenTrophyModal trophy={expandedTrophy} onClose={() => setExpandedTrophy(null)} />
    </>
  );
}
