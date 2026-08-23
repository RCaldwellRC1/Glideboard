import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Sensitivity presets for different workout styles
export type MotionSensitivity = 'low' | 'medium' | 'high';

// Rep counting mode
export type RepCountingMode = 'motion' | 'voice';

// Global text size preference. 'medium' is the app's original type scale, so
// existing users see no change unless they opt into Small/Large. The factor is
// applied to every Text's fontSize at the root (see src/app/_layout.tsx).
export type TextSize = 'small' | 'medium' | 'large';

export const TEXT_SIZE_FACTORS: Record<TextSize, number> = {
  small: 0.85,
  medium: 1,
  large: 1.15,
};

export const TEXT_SIZE_LABELS: Record<TextSize, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
};

// The app's base type scale, mirrored from tailwind.config.js. Each tailwind
// text-* class resolves to var(--fs-<key>, <base>px); we feed those vars at the
// app root (src/app/_layout.tsx) so changing Text Size rescales the whole scale
// at once. Keep these keys/values in sync with tailwind.config.js.
export const BASE_FONT_SIZES: Record<string, number> = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 20,
  xl: 22,
  '2xl': 26,
  '3xl': 34,
  '4xl': 42,
  '5xl': 50,
  '6xl': 58,
  '7xl': 66,
  '8xl': 74,
  '9xl': 82,
};

// Build the { '--fs-xs': '10px', ... } map for the given size, scaled by its
// factor. Passed to NativeWind's vars() at the root.
export function getFontSizeVars(size: TextSize): Record<string, string> {
  const factor = TEXT_SIZE_FACTORS[size] ?? 1;
  const out: Record<string, string> = {};
  for (const key in BASE_FONT_SIZES) {
    out[`--fs-${key}`] = `${Math.round(BASE_FONT_SIZES[key] * factor)}px`;
  }
  return out;
}

// Subscribe a screen to text-size changes so it re-renders (and re-applies the
// global font multiplier) the moment the user picks a new size. Returns the
// current value but most callers just need the subscription side-effect.
export function useTextScaleSubscription(): TextSize {
  return useSettingsStore(s => s.textSize);
}

// Hook to access the current theme colors throughout the app
export function useTheme(): ThemeColors {
  const colorTheme = useSettingsStore(s => s.colorTheme);
  return THEME_PALETTE[colorTheme] ?? THEME_PALETTE.dark;
}

export const SENSITIVITY_CONFIG = {
  low: { minAccelChange: 0.6, repCooldown: 1500, label: 'Low (Slow exercises)' },
  medium: { minAccelChange: 0.4, repCooldown: 1200, label: 'Medium (Default)' },
  high: { minAccelChange: 0.25, repCooldown: 800, label: 'High (Fast exercises)' },
} as const;

// Pace settings interface
export interface PaceSettings {
  delayToStart: number;  // Seconds before timer starts (default 6)
  liftTime: number;      // Lift phase duration in seconds (default 2)
  holdTime: number;      // Hold at top duration in seconds (default 1)
  downTime: number;      // Down phase duration in seconds (default 3)
  pauseTime: number;     // Pause before next rep in seconds (default 2)
}

export const DEFAULT_PACE_SETTINGS: PaceSettings = {
  delayToStart: 6,
  liftTime: 2,
  holdTime: 1,
  downTime: 3,
  pauseTime: 2,
};

// App color theme
export type ColorTheme = 'light' | 'dark';

export interface ThemeColors {
  background: string;
  card: string;
  text: string;
  subText: string;
  border: string;
  divider: string;
}

export const THEME_PALETTE: Record<ColorTheme, ThemeColors> = {
  dark: {
    background: '#000000',
    card: '#111827', // gray-900
    text: '#ffffff',
    subText: '#9ca3af', // gray-400
    border: '#1f2937', // gray-800
    divider: '#1f2937',
  },
  light: {
    background: '#ffffff',
    card: '#f3f4f6', // gray-100
    text: '#000000',
    subText: '#4b5563', // gray-600
    border: '#e5e7eb', // gray-200
    divider: '#d1d5db', // gray-300
  },
};

interface SettingsState {
  colorTheme: ColorTheme;
  largeDisplayMode: boolean;
  textSize: TextSize;
  motionSensitivity: MotionSensitivity;
  // THE single Motion/Voice setting. Both the Tracker screen's vertical toggle
  // and the App Settings switch read and write this same field, so changing it
  // in either place changes it in both and the most recent tap wins.
  repCountingMode: RepCountingMode;
  // True once the user has picked a mode by hand (from either toggle). An
  // explicit pick WINS over the app's automatic selection — e.g. Free Style
  // exercises default to Voice, but the user can force Motion. Reset when a
  // workout ends, so each workout starts back on automatic behaviour.
  repModeUserSet: boolean;
  paceSettings: PaceSettings;
  isLoaded: boolean;

  // Actions
  setColorTheme: (theme: ColorTheme) => void;
  setLargeDisplayMode: (enabled: boolean) => void;
  setTextSize: (size: TextSize) => void;
  setMotionSensitivity: (sensitivity: MotionSensitivity) => void;
  // Used by BOTH Motion/Voice toggles. Marks the choice as explicit.
  setRepCountingMode: (mode: RepCountingMode) => void;
  // Back to Motion + automatic selection. Called when a workout ends.
  resetRepCountingMode: () => void;
  setPaceSettings: (settings: Partial<PaceSettings>) => void;
  loadFromStorage: () => Promise<void>;
}

const SETTINGS_STORAGE_KEY = 'app-settings';

export const useSettingsStore = create<SettingsState>((set, get) => {
  // Persist the full settings snapshot. Called by every setter so we never
  // drift out of sync when a new field (like textSize) is added.
  const persist = async () => {
    try {
      const s = get();
      await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
        colorTheme: s.colorTheme,
        largeDisplayMode: s.largeDisplayMode,
        textSize: s.textSize,
        motionSensitivity: s.motionSensitivity,
        repCountingMode: s.repCountingMode,
        repModeUserSet: s.repModeUserSet,
        paceSettings: s.paceSettings,
      }));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  return {
    colorTheme: 'dark',
    largeDisplayMode: false,
    textSize: 'medium',
    motionSensitivity: 'medium',
    repCountingMode: 'motion',
    repModeUserSet: false,
    paceSettings: { ...DEFAULT_PACE_SETTINGS },
    isLoaded: false,

    setColorTheme: (theme: ColorTheme) => {
      set({ colorTheme: theme });
      persist();
    },

    setLargeDisplayMode: (enabled: boolean) => {
      set({ largeDisplayMode: enabled });
      persist();
    },

    setTextSize: (size: TextSize) => {
      set({ textSize: size });
      persist();
    },

    setMotionSensitivity: (sensitivity: MotionSensitivity) => {
      set({ motionSensitivity: sensitivity });
      persist();
    },

    setRepCountingMode: (mode: RepCountingMode) => {
      // Shared by the Tracker toggle and the App Settings switch, so whichever
      // one the user touched last wins and both show the same thing. Flagging
      // the pick as user-set makes it beat the automatic per-category choice.
      set({ repCountingMode: mode, repModeUserSet: true });
      persist();
    },

    resetRepCountingMode: () => {
      // Back to Motion with automatic selection re-enabled (workout ended).
      set({ repCountingMode: 'motion', repModeUserSet: false });
      persist();
    },

    setPaceSettings: (settings: Partial<PaceSettings>) => {
      set({ paceSettings: { ...get().paceSettings, ...settings } });
      persist();
    },

    loadFromStorage: async () => {
      try {
        const data = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
        if (data) {
          const parsed = JSON.parse(data);
          set({
            colorTheme: parsed.colorTheme ?? 'dark',
            largeDisplayMode: parsed.largeDisplayMode ?? false,
            textSize: parsed.textSize ?? 'medium',
            motionSensitivity: parsed.motionSensitivity ?? 'medium',
            // Restore the saved rep-counting mode. Voice must stay selected for
            // the WHOLE workout (across every set), so we can't force Motion on
            // load — a screen remount or a trip to Settings mid-workout would
            // then silently knock Voice back to Motion between sets. Instead the
            // reset to Motion happens exactly once, when a workout ENDS (see
            // endWorkout in the workout store). (Timed and Free Style force their
            // own modes regardless of this value.)
            repCountingMode: parsed.repCountingMode === 'voice' ? 'voice' : 'motion',
            // Same reasoning: keep the "user picked this by hand" flag so a
            // remount mid-workout doesn't undo an explicit choice.
            repModeUserSet: parsed.repModeUserSet === true,
            paceSettings: { ...DEFAULT_PACE_SETTINGS, ...(parsed.paceSettings ?? {}) },
            isLoaded: true,
          });
        } else {
          set({ isLoaded: true });
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
        set({ isLoaded: true });
      }
    },
  };
});
