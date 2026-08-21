import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, AppState, StyleSheet, Image, Animated, type AppStateStatus } from 'react-native';
import { Text as RNText, TextInput as RNTextInput } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useColorScheme } from '@/lib/useColorScheme';
import { MotionProvider } from '@/lib/motion';
import { remoteLog, initRemoteLog } from '@/lib/remoteLog';
import { isStoreConfigured } from '@/lib/purchases';
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

// Keep splash visible until JS is ready.
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
  const [appIsReady, setAppIsReady] = useState(false);
  const [showGreeting, setShowGreeting] = useState(false);

  useKeepAwake();

  useEffect(() => {
    async function prepare() {
      try {
        await initRemoteLog();
        const loadSettings = useSettingsStore.getState().loadFromStorage;
        await loadSettings();
      } catch (e) {
        console.warn('[BOOT] Prepare error:', e);
      } finally {
        setAppIsReady(true);
        setShowGreeting(true);
      }
    }
    prepare();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
      focusManager.setFocused(status === 'active');
    });
    return () => sub.remove();
  }, []);

  const onGreetingFinish = useCallback(() => {
    setShowGreeting(false);
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      // Hide native splash once the root view is laid out.
      await SplashScreen.hideAsync().catch(() => {});
    }
  }, [appIsReady]);

  if (!appIsReady) {
    return null;
  }

  return (
    <RootErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
          <KeyboardProvider>
            <MotionProvider updateInterval={16} smoothingFactor={0.8}>
              <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
              <RootLayoutNav colorScheme={colorScheme} />
              {showGreeting && (
                <CustomGreeting onFinish={onGreetingFinish} />
              )}
            </MotionProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </RootErrorBoundary>
  );
}

function CustomGreeting({ onFinish }: { onFinish: () => void }) {
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timeout = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => {
        onFinish();
      });
    }, 2000);
    return () => clearTimeout(timeout);
  }, [fadeAnim, onFinish]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', zIndex: 1000, opacity: fadeAnim },
      ]}
    >
      <View style={{ alignItems: 'center' }}>
        <Image
          source={require('../../icon.png')}
          style={{ width: 140, height: 140, borderRadius: 28 }}
          resizeMode="contain"
        />
        <View style={{ marginTop: 32, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 60, textAlign: 'center' }}>Hi</Text>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 30, textAlign: 'center', marginTop: 8 }}>Let's Do This!</Text>
        </View>
      </View>
    </Animated.View>
  );
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: '' };
  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, message: error instanceof Error ? error.message : String(error) };
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
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 8, textAlign: 'center' }}>Something went wrong</Text>
          <Pressable onPress={() => this.setState({ hasError: false, message: '' })} style={{ backgroundColor: '#f97316', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Try Again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}
