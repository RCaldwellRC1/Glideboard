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
import React, { useEffect } from 'react';
import { View, Text, Pressable, AppState, type AppStateStatus } from 'react-native';
import { Text as RNText, TextInput as RNTextInput } from 'react-native';
import { vars } from 'nativewind';
import { useSettingsStore, getFontSizeVars } from '@/lib/settings/store';

// Cap font scaling for accessibility.
const MAX_FONT_SCALE = 1.3;
// @ts-ignore
RNText.defaultProps = RNText.defaultProps || {};
// @ts-ignore
RNText.defaultProps.maxFontSizeMultiplier = MAX_FONT_SCALE;
// @ts-ignore
RNTextInput.defaultProps = RNTextInput.defaultProps || {};
// @ts-ignore
RNTextInput.defaultProps.maxFontSizeMultiplier = MAX_FONT_SCALE;

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding.
SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient();

function RootLayoutNav({ colorScheme }: { colorScheme: 'light' | 'dark' | null | undefined }) {
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

  useKeepAwake();

  useEffect(() => {
    async function init() {
      try {
        const purchaseMode = isStoreConfigured ? 'REAL' : 'SIMULATED';
        console.log(`[PURCHASES] mode: ${purchaseMode}`);

        await initRemoteLog();
        remoteLog('app_open', { platform: 'mobile' });

        await useSettingsStore.getState().loadFromStorage();
      } catch (err) {
        console.warn('[BOOT] Init error:', err);
      } finally {
        SplashScreen.hideAsync().catch(() => {});
      }
    }
    init();
  }, []);

  useEffect(() => {
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
            {/*
                CRITICAL STABILITY FIX: autoStart={false}
                We prevent the hardware sensor probe from running during boot.
                It is manually started once the Tracker (index.tsx) mounts.
            */}
            <MotionProvider updateInterval={16} smoothingFactor={0.8} autoStart={false}>
              <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
              <RootLayoutNav colorScheme={colorScheme} />
            </MotionProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </RootErrorBoundary>
  );
}

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
          <Text style={{ color: '#ef4444', fontSize: 14, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' }}>
            DEBUG ERROR: {this.state.message}
          </Text>
          <Text style={{ color: '#9ca3af', fontSize: 12, marginBottom: 24, textAlign: 'center' }}>
            Please report the red message above to support.
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
