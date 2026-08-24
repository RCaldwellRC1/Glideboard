import React, { useMemo } from 'react';
import { View, Text, Pressable, Dimensions, StyleSheet } from 'react-native';
import Svg, {
  Line,
  Polyline,
  Circle,
  Text as SvgText,
  G,
  Rect,
  Defs,
  ClipPath,
} from 'react-native-svg';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedReaction,
  runOnJS,
  SlideInDown,
  FadeIn,
} from 'react-native-reanimated';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWorkoutStore, getExerciseChartSeries } from '@/lib/workout';
import { useTheme } from '@/lib/settings';

const LEVEL_COLOR = '#f97316'; // orange — incline level
const REPS_COLOR = '#38bdf8'; // sky blue — reps

interface PRChartModalProps {
  // The exercise to chart, or null when the modal is closed.
  exercise: string | null;
  onClose: () => void;
}

// A pop-out line chart for a single exercise's progress. Plots two lines against
// time — incline level (left axis) and reps (right axis) — and can be pinch-
// zoomed and dragged to show a longer or shorter time span.
export function PRChartModal({ exercise, onClose }: PRChartModalProps) {
  const theme = useTheme();
  const workoutHistory = useWorkoutStore(s => s.workoutHistory);
  const insets = useSafeAreaInsets();

  const series = useMemo(
    () => (exercise ? getExerciseChartSeries(workoutHistory, exercise) : []),
    [workoutHistory, exercise]
  );

  // Rendered as an in-page overlay (not a React Native <Modal>). RN's Modal
  // lives in a separate native view tree, and pinch gestures inside it are
  // unreliable on iOS — they can wedge the touch system so nothing responds.
  // An absolute overlay stays inside the app's root GestureHandlerRootView,
  // where gestures work correctly.
  if (exercise === null) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 50 }]} className="justify-end">
      <Animated.View entering={FadeIn.duration(150)} style={StyleSheet.absoluteFill}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} className="bg-black/80" />
      </Animated.View>
      <Animated.View entering={SlideInDown.duration(220)}>
        <View
          style={{ backgroundColor: theme.card, paddingBottom: insets.bottom + 16 }}
          className="rounded-t-3xl px-4 pt-4"
        >
          {/* Header */}
          <View className="flex-row items-center justify-between mb-1">
            <View className="flex-1 mr-3">
              <Text style={{ color: theme.text }} className="font-bold text-xl" numberOfLines={1}>
                {exercise}
              </Text>
              <Text style={{ color: theme.subText }} className="text-xs mt-0.5 opacity-60">Progress over time</Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={{ backgroundColor: theme.background === '#ffffff' ? '#e5e7eb' : '#1f2937' }}
              className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
            >
              <X size={20} color={theme.subText} />
            </Pressable>
          </View>

          {/* Legend */}
          <View className="flex-row items-center mt-2 mb-1">
            <View className="flex-row items-center mr-4">
              <View className="w-3 h-3 rounded-full mr-1.5" style={{ backgroundColor: LEVEL_COLOR }} />
              <Text style={{ color: theme.text }} className="text-sm opacity-80">Incline Level</Text>
            </View>
            <View className="flex-row items-center">
              <View className="w-3 h-3 rounded-full mr-1.5" style={{ backgroundColor: REPS_COLOR }} />
              <Text style={{ color: theme.text }} className="text-sm opacity-80">Reps</Text>
            </View>
          </View>

          {series.length === 0 ? (
            <View className="h-64 items-center justify-center">
              <Text style={{ color: theme.subText }} className="text-center text-sm px-6 opacity-60">
                No data to chart yet. Complete a few sessions of this exercise to
                see your progress.
              </Text>
            </View>
          ) : (
            <>
              <ChartCanvas series={series} />
              <Text style={{ color: theme.subText }} className="text-center text-xs mt-2 opacity-50">
                Pinch to zoom the time span • Drag to scroll
              </Text>
            </>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

interface ChartCanvasProps {
  series: { date: Date; level: number; reps: number }[];
}

const CHART_HEIGHT = 250;
const MARGIN = { top: 16, right: 42, bottom: 30, left: 34 };

function ChartCanvas({ series }: ChartCanvasProps) {
  const theme = useTheme();
  const screenW = Dimensions.get('window').width;
  const chartW = screenW - 32; // modal has px-4 (16px) each side
  const plotLeft = MARGIN.left;
  const plotRight = chartW - MARGIN.right;
  const plotTop = MARGIN.top;
  const plotBottom = CHART_HEIGHT - MARGIN.bottom;
  const plotW = plotRight - plotLeft;
  const plotH = plotBottom - plotTop;

  // Time domain (fall back to a 1ms span for a single point to avoid /0).
  const times = series.map(p => p.date.getTime());
  const tMin = Math.min(...times);
  const tMaxRaw = Math.max(...times);
  const tSpan = Math.max(1, tMaxRaw - tMin);

  // Y domains. Incline uses the fixed 1–15 scale; reps scales to the data.
  const levelMax = 15;
  const repsMax = Math.max(5, ...series.map(p => p.reps));

  // Open on the most recent ~1 month. If the user has less than a month of
  // history, show everything. A tighter default keeps the side-by-side set
  // dots (see setOffsets below) from crowding together. Expressed as a
  // fraction of the full time span.
  const ONE_MONTH_MS = 30 * 86400000;
  const initialFrac = Math.min(1, ONE_MONTH_MS / tSpan);
  const initialStart = 1 - initialFrac;
  // Tightest zoom-in allowed (~1 week, but never wider than the opening view).
  const minWindowFrac = Math.min(initialFrac, Math.max(0.01, (7 * 86400000) / tSpan));

  // Visible window as fractions [0,1] of the full time span. Mirrored from
  // shared values (updated by gestures) into state so the SVG re-renders.
  const startSV = useSharedValue(initialStart);
  const endSV = useSharedValue(1);
  const savedStart = useSharedValue(initialStart);
  const savedEnd = useSharedValue(1);
  const [view, setView] = React.useState({ start: initialStart, end: 1 });

  useAnimatedReaction(
    () => ({ s: startSV.value, e: endSV.value }),
    cur => {
      runOnJS(setView)({ start: cur.s, end: cur.e });
    }
  );

  // Memoized so the active gesture isn't torn down by the per-frame re-renders
  // it triggers. Depends only on the (stable-per-series) plot geometry.
  const gesture = useMemo(() => {
    const pinch = Gesture.Pinch()
      .onBegin(() => {
        savedStart.value = startSV.value;
        savedEnd.value = endSV.value;
      })
      .onUpdate(e => {
        const width = savedEnd.value - savedStart.value;
        const focal = Math.min(1, Math.max(0, (e.focalX - plotLeft) / plotW));
        const focalFrac = savedStart.value + focal * width;
        const newWidth = Math.min(1, Math.max(minWindowFrac, width / e.scale));
        let ns = focalFrac - focal * newWidth;
        let ne = ns + newWidth;
        if (ns < 0) {
          ns = 0;
          ne = newWidth;
        }
        if (ne > 1) {
          ne = 1;
          ns = 1 - newWidth;
        }
        startSV.value = ns;
        endSV.value = ne;
      });

    const pan = Gesture.Pan()
      // Single-finger only, so it never runs during a two-finger pinch — if it
      // did, pan (which keeps the window width fixed) would fight the pinch and
      // cancel out zooming.
      .maxPointers(1)
      .onBegin(() => {
        savedStart.value = startSV.value;
        savedEnd.value = endSV.value;
      })
      .onUpdate(e => {
        const width = savedEnd.value - savedStart.value;
        const deltaFrac = -(e.translationX / plotW) * width;
        let ns = savedStart.value + deltaFrac;
        let ne = savedEnd.value + deltaFrac;
        if (ns < 0) {
          ns = 0;
          ne = width;
        }
        if (ne > 1) {
          ne = 1;
          ns = 1 - width;
        }
        startSV.value = ns;
        endSV.value = ne;
      });

    return Gesture.Simultaneous(pinch, pan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plotLeft, plotW, minWindowFrac]);

  // Visible time range from the fraction window.
  const visStart = tMin + view.start * tSpan;
  const visEnd = tMin + view.end * tSpan;
  const visSpan = Math.max(1, visEnd - visStart);

  const xFor = (t: number) => plotLeft + ((t - visStart) / visSpan) * plotW;
  const yLevel = (l: number) => plotBottom - (l / levelMax) * plotH;
  const yReps = (r: number) => plotBottom - (r / repsMax) * plotH;

  // Multiple sets from the same day share (nearly) the same timestamp, so their
  // dots would stack on top of one another at a single x. Nudge each set a few
  // pixels sideways in set order — centered on the day — so they read left→
  // right as set 1, set 2, set 3. Fixed pixel spacing (not time-based) keeps
  // the spread consistent at any zoom level.
  const SET_SPACING = 8; // px between adjacent sets on the same day
  const setOffsets = useMemo(() => {
    const offsets = new Array<number>(series.length).fill(0);
    let i = 0;
    while (i < series.length) {
      // Collect the run of consecutive points that fall on the same calendar day.
      const day = new Date(series[i].date).setHours(0, 0, 0, 0);
      let j = i;
      while (
        j < series.length &&
        new Date(series[j].date).setHours(0, 0, 0, 0) === day
      ) {
        j++;
      }
      const n = j - i; // number of sets that day
      for (let k = 0; k < n; k++) {
        offsets[i + k] = (k - (n - 1) / 2) * SET_SPACING;
      }
      i = j;
    }
    return offsets;
  }, [series]);

  const xForPoint = (i: number) => xFor(series[i].date.getTime()) + setOffsets[i];

  const levelPoints = series
    .map((p, i) => `${xForPoint(i)},${yLevel(p.level)}`)
    .join(' ');
  const repsPoints = series
    .map((p, i) => `${xForPoint(i)},${yReps(p.reps)}`)
    .join(' ');

  // X-axis date ticks across the visible window.
  const xTicks = useMemo(() => {
    const count = 4;
    const ticks: { x: number; label: string }[] = [];
    for (let i = 0; i <= count; i++) {
      const t = visStart + (i / count) * visSpan;
      ticks.push({
        x: plotLeft + (i / count) * plotW,
        label: new Date(t).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
      });
    }
    return ticks;
  }, [visStart, visSpan, plotLeft, plotW]);

  // Left (incline) and right (reps) axis gridline values.
  const levelTicks = [0, 5, 10, 15];
  const repsTicks = [0, Math.round(repsMax / 2), repsMax];

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ width: chartW, height: CHART_HEIGHT }}>
        <Svg width={chartW} height={CHART_HEIGHT}>
          <Defs>
            <ClipPath id="plot">
              <Rect x={plotLeft} y={plotTop} width={plotW} height={plotH} />
            </ClipPath>
          </Defs>

          {/* Horizontal gridlines + left (incline) axis labels */}
          {levelTicks.map(l => (
            <G key={`lvl-${l}`}>
              <Line
                x1={plotLeft}
                y1={yLevel(l)}
                x2={plotRight}
                y2={yLevel(l)}
                stroke={theme.divider}
                strokeWidth={1}
              />
              <SvgText
                x={plotLeft - 6}
                y={yLevel(l) + 4}
                fill={LEVEL_COLOR}
                fontSize={10}
                textAnchor="end"
              >
                {l}
              </SvgText>
            </G>
          ))}

          {/* Right (reps) axis labels */}
          {repsTicks.map(r => (
            <SvgText
              key={`rep-${r}`}
              x={plotRight + 6}
              y={yReps(r) + 4}
              fill={REPS_COLOR}
              fontSize={10}
              textAnchor="start"
            >
              {r}
            </SvgText>
          ))}

          {/* X-axis date labels */}
          {xTicks.map((tk, i) => (
            <SvgText
              key={`x-${i}`}
              x={tk.x}
              y={CHART_HEIGHT - 10}
              fill={theme.subText}
              fontSize={10}
              textAnchor="middle"
              opacity={0.6}
            >
              {tk.label}
            </SvgText>
          ))}

          {/* Data lines + points, clipped to the plot area */}
          <G clipPath="url(#plot)">
            {series.length > 1 && (
              <>
                <Polyline points={levelPoints} fill="none" stroke={LEVEL_COLOR} strokeWidth={2} />
                <Polyline points={repsPoints} fill="none" stroke={REPS_COLOR} strokeWidth={2} />
              </>
            )}
            {series.map((p, i) => {
              const x = xForPoint(i);
              return (
                <G key={`pt-${i}`}>
                  <Circle cx={x} cy={yLevel(p.level)} r={3} fill={LEVEL_COLOR} />
                  <Circle cx={x} cy={yReps(p.reps)} r={3} fill={REPS_COLOR} />
                </G>
              );
            })}
          </G>
        </Svg>
      </View>
    </GestureDetector>
  );
}
