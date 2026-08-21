import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from '@/lib/useColorScheme';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { MotionProvider } from '@/lib/motion';
import { remoteLog, initRemoteLog } from '@/lib/remoteLog';
import { isStoreConfigured } from '@/lib/purchases';
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, AppState, StyleSheet, Image, type AppStateStatus } from 'react-native';
import { Text as RNText, TextInput as RNTextInput } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import { vars } from 'nativewind';
import { useSettingsStore, getFontSizeVars } from '@/lib/settings/store';

// Cap how much the iOS "Larger Text" accessibility setting can inflate fonts.
// The app's own type scale (tailwind.config.js) is already sized for comfortable
// reading without OS scaling, so we let Larger Text add up to ~30% on top but no
// more — beyond that, fixed-size elements (rep-entry fields, the big REPS/SET
// tiles, badges) would clip or overflow. Honors accessibility while keeping
// layouts intact across Display Zoom + Larger Text combinations.
const MAX_FONT_SCALE = 1.3;
// @ts-ignore defaultProps is the documented RN escape hatch for global text config.
RNText.defaultProps = RNText.defaultProps || {};
// @ts-ignore
RNText.defaultProps.maxFontSizeMultiplier = MAX_FONT_SCALE;
// @ts-ignore
RNTextInput.defaultProps = RNTextInput.defaultProps || {};
// @ts-ignore
RNTextInput.defaultProps.maxFontSizeMultiplier = MAX_FONT_SCALE;

// Global "Text Size" preference (Small / Medium / Large) is applied as CSS
// variables at the root (see RootLayoutNav) — the tailwind type scale reads
// those vars, so every text-* class scales together. Nothing to patch here.

export const unstable_settings = {
  // Land on the tab navigator when the app (re)loads.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav({ colorScheme }: { colorScheme: 'light' | 'dark' | null | undefined }) {
  // Feed the Text Size preference as CSS variables that wrap the whole app.
  // The tailwind type scale reads these vars, so the moment textSize changes
  // this View re-renders and every text-* element rescales together.
  const textSize = useSettingsStore(s => s.textSize);
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View style={[{ flex: 1 }, vars(getFontSizeVars(textSize))]}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="app-settings" options={{ headerShown: false }} />
        <Stack.Screen name="unlock" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="how-it-works" options={{ headerShown: false }} />
        <Stack.Screen name="coach" options={{ headerShown: false }} />
        <Stack.Screen name="coach-routine" options={{ headerShown: false }} />
        <Stack.Screen name="coach-program" options={{ headerShown: false }} />
        <Stack.Screen name="coach-build" options={{ headerShown: false }} />
        <Stack.Screen name="diagnostics" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="workout-summary" options={{ headerShown: false }} />
        <Stack.Screen name="privacy-policy" options={{ headerShown: false }} />
      </Stack>
      </View>
    </ThemeProvider>
  );
}



export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [showGreeting, setShowGreeting] = useState(true);

  // Keep the device screen awake the entire time the app is in the foreground.
  // Without this, iOS dims and then auto-locks the phone after the user's Auto-Lock
  // timeout (often 30s), which is disruptive mid-workout when the user is looking
  // at the screen but not touching it (e.g. resting between sets). This tells the
  // OS the app is actively in use so the phone won't sleep or go to the lock
  // screen. expo-keep-awake automatically releases the lock when the app is
  // backgrounded or closed, so normal locking resumes outside the app.
  useKeepAwake();

  useEffect(() => {
    // Dismiss the native splash/launch screen. We called preventAutoHideAsync()
    // at module load, so it is OUR responsibility to hide it — otherwise a
    // production build (TestFlight / App Store) sits forever on a blank white
    // launch screen. Wrapped in try/catch because hideAsync rejects harmlessly
    // if the splash is already gone.
    SplashScreen.hideAsync().catch(() => {});

    // One-line confirmation of which purchase mode this build is running in.
    // REAL  = RevenueCat key is configured → tapping Subscribe opens Apple's
    //         real payment sheet (required for the App Store sandbox purchase
    //         test and for live sales).
    // SIMULATED = no key → purchases unlock locally without Apple IAP (preview
    //         only; would fail Apple's purchase test).
    // Check this in the Vibecode LOGS tab on your TestFlight build before testing.
    const purchaseMode = isStoreConfigured ? 'REAL' : 'SIMULATED';
    console.log(`[PURCHASES] mode: ${purchaseMode}`);

    initRemoteLog().then(() => {
      remoteLog('app_open', { platform: 'mobile' });
      remoteLog('purchase_mode', { mode: purchaseMode });
    });
  }, []);

  useEffect(() => {
    // Re-check entitlements (and any other server state) when the app returns to
    // the foreground. React Query has no focus listener on React Native by
    // default, so we bridge AppState -> focusManager here. A focus event only
    // triggers a refetch for STALE queries, and the unlock query has a 30s
    // staleTime (see purchases.ts), so rapid background/foreground toggling
    // won't spam the network — that staleTime is the throttle.
    //
    // This re-reads the subscription entitlement from RevenueCat, so returning
    // to the foreground picks up a subscription that became active elsewhere.
    const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
      focusManager.setFocused(status === 'active');
    });
    return () => sub.remove();
  }, []);

  return (
    <RootErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <KeyboardProvider>
            <MotionProvider updateInterval={16} smoothingFactor={0.8}>
              <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
              <RootLayoutNav colorScheme={colorScheme} />
              {showGreeting && <CustomGreeting onFinish={() => setShowGreeting(false)} />}
            </MotionProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </RootErrorBoundary>
  );
}

/**
 * Branded greeting screen that follows the native splash.
 * Shows the logo and a friendly "Hi / Let's Do This!" message for 2 seconds.
 */
function CustomGreeting({ onFinish }: { onFinish: () => void }) {
  const fade = useSharedValue(1);

  useEffect(() => {
    // Hold the message for 2 seconds, then fade out gracefully.
    const timeout = setTimeout(() => {
      fade.value = withTiming(0, { duration: 600 }, (finished) => {
        if (finished) runOnJS(onFinish)();
      });
    }, 2000);
    return () => clearTimeout(timeout);
  }, [fade, onFinish]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
        animatedStyle
      ]}
    >
      <View style={{ alignItems: 'center' }}>
        <Image
          source={require('../../icon.png')}
          style={{ width: 140, height: 140, borderRadius: 28 }}
          resizeMode="contain"
        />
        <View style={{ marginTop: 32, alignItems: 'center' }}>
          <Text className="text-white font-black text-6xl text-center">Hi</Text>
          <Text className="text-white font-bold text-3xl text-center mt-2">Let's Do This!</Text>
        </View>
      </View>
    </Animated.View>
  );
}

// Catches any render-time crash in the tree below it. Without this, an uncaught
// error in production shows a silent white screen (in dev you'd see the red
// LogBox). Here we show a readable fallback and log the error remotely so we can
// see what happened on a real device.
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown) {
    try {
      remoteLog('app_crash', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    } catch {}
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', padding: 24 }}>
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 8, textAlign: 'center' }}>
            Something went wrong
          </Text>
          <Text style={{ color: '#9ca3af', fontSize: 14, marginBottom: 24, textAlign: 'center' }}>
            The app ran into an unexpected error. Please try again.
          </Text>
          <Pressable
            onPress={() => this.setState({ hasError: false, message: '' })}
            style={{ backgroundColor: '#f97316', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Try Again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}
