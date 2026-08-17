import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ChevronLeft, CheckCircle2, XCircle, Activity, Info, Send, AlertTriangle, RefreshCw
} from 'lucide-react-native';
import { useMotionContext } from '@/lib/motion';
import { useSettingsStore, useTextScaleSubscription } from '@/lib/settings';
import { remoteLog } from '@/lib/remoteLog';
import * as Device from 'expo-device';

export default function DiagnosticsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { motion, diagnostics, restart } = useMotionContext();
  const largeDisplayMode = useSettingsStore(s => s.largeDisplayMode);
  useTextScaleSubscription();

  const [testMode, setTestMode] = useState<'wiggle' | 'rep'>('wiggle');
  const [repTestState, setRepTestState] = useState<'idle' | 'testing' | 'result'>('idle');
  const [testResult, setTestResult] = useState<{ peak: number; duration: number } | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Peak magnitude for wiggle test
  const [wigglePeak, setWigglePeak] = useState(0);
  const { x, y, z } = motion.accelerationIncludingGravity;
  const magnitude = Math.sqrt(x * x + y * y + z * z);

  useEffect(() => {
    if (magnitude > wigglePeak) setWigglePeak(magnitude);
  }, [magnitude, wigglePeak]);

  // Rep test logic
  const lastRepPeak = useRef(0);
  const repStartAt = useRef(0);

  const startRepTest = () => {
    setRepTestState('testing');
    setTestResult(null);
    lastRepPeak.current = 0;
    repStartAt.current = Date.now();
    remoteLog('diag_rep_test_started');
  };

  useEffect(() => {
    if (repTestState !== 'testing') return;

    // Simplified rep detection for diagnostics
    const deviation = Math.abs(magnitude - 9.8); // 9.8 is roughly resting baseline
    if (deviation > lastRepPeak.current) {
      lastRepPeak.current = deviation;
    }

    // Stop test after 5 seconds
    if (Date.now() - repStartAt.current > 5000) {
      setTestResult({
        peak: lastRepPeak.current,
        duration: Date.now() - repStartAt.current,
      });
      setRepTestState('result');
      remoteLog('diag_rep_test_finished', { peak: lastRepPeak.current });
    }
  }, [magnitude, repTestState]);

  const sendReport = async () => {
    setIsSending(true);
    try {
      // Gather diagnostic bundle
      const bundle = {
        device: {
          brand: Device.brand,
          modelName: Device.modelName,
          osName: Device.osName,
          osVersion: Device.osVersion,
          totalMemory: Device.totalMemory,
        },
        sensors: {
          source: diagnostics.source,
          healthy: diagnostics.isHealthy,
          rate: diagnostics.sampleRateHz,
          error: diagnostics.error,
        },
        test: {
          wigglePeak: wigglePeak.toFixed(2),
          repPeak: testResult?.peak.toFixed(2),
        }
      };

      remoteLog('diagnostic_report_sent', bundle);

      Alert.alert(
        "Report Sent",
        "Thank you! Your phone's sensor data has been sent to our team. We will look into it immediately.",
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (err) {
      Alert.alert("Error", "Failed to send report. Please check your connection.");
    } finally {
      setIsSending(false);
    }
  };

  const StatusIcon = ({ check }: { check: boolean | null }) => {
    if (check === true) return <CheckCircle2 size={18} color="#22c55e" />;
    if (check === false) return <XCircle size={18} color="#ef4444" />;
    return <Activity size={18} color="#6b7280" />;
  };

  return (
    <View className="flex-1 bg-black">
      <View style={{ paddingTop: insets.top + 10 }} className="px-4 pb-4 border-b border-gray-900 flex-row items-center">
        <Pressable onPress={() => router.back()} className="p-2 -ml-2 active:opacity-60">
          <ChevronLeft size={28} color="#f97316" />
        </Pressable>
        <Text className="text-white font-bold text-xl ml-2">Troubleshoot Counting</Text>
      </View>

      <ScrollView className="flex-1 px-4 pt-6" showsVerticalScrollIndicator={false}>
        {/* Hardware Status */}
        <View className="bg-gray-900 rounded-2xl p-4 mb-6">
          <Text className="text-gray-400 font-bold mb-4 uppercase tracking-widest text-xs">1. Hardware Check</Text>

          <View className="flex-row items-center justify-between py-2 border-b border-gray-800">
            <Text className="text-white text-base">Motion Sensor</Text>
            <StatusIcon check={diagnostics.accelerometerAvailable} />
          </View>

          <View className="flex-row items-center justify-between py-2 border-b border-gray-800">
            <Text className="text-white text-base">Data Stream</Text>
            <StatusIcon check={diagnostics.isHealthy} />
          </View>

          <View className="mt-4 flex-row items-start">
            <Info size={16} color="#9ca3af" style={{ marginTop: 2 }} />
            <Text className="text-gray-500 text-sm ml-2 flex-1">
              If these are green, your phone's hardware is working correctly.
            </Text>
          </View>

          {diagnostics.error && (
            <View className="mt-4 bg-red-500/10 p-3 rounded-xl border border-red-500/20">
              <Text className="text-red-400 text-xs font-bold uppercase mb-1">Issue Detected:</Text>
              <Text className="text-red-300 text-sm">{diagnostics.error}</Text>
            </View>
          )}

          <Pressable
            onPress={restart}
            className="mt-4 flex-row items-center justify-center bg-gray-800 py-3 rounded-xl active:bg-gray-700"
          >
            <RefreshCw size={16} color="#f97316" />
            <Text className="text-orange-500 font-bold ml-2">Restart Sensors</Text>
          </Pressable>
        </View>

        {/* Wiggle Test */}
        <View className="bg-gray-900 rounded-2xl p-4 mb-6">
          <Text className="text-gray-400 font-bold mb-4 uppercase tracking-widest text-xs">2. The Wiggle Test</Text>
          <Text className="text-gray-200 mb-4">
            Place your phone on the board and give it a shake. The bar below should react.
          </Text>

          <View className="h-4 bg-gray-800 rounded-full overflow-hidden mb-2">
            <View
              className="h-full bg-orange-500 rounded-full"
              style={{ width: `${Math.min(100, (magnitude / 20) * 100)}%` }}
            />
          </View>
          <View className="flex-row justify-between">
            <Text className="text-gray-600 text-xs">STILL</Text>
            <Text className="text-gray-600 text-xs">ACTIVE</Text>
          </View>

          {wigglePeak < 10.5 && magnitude < 10.5 && (
            <View className="mt-4 flex-row items-center justify-center bg-yellow-500/10 p-3 rounded-xl">
              <AlertTriangle size={16} color="#eab308" />
              <Text className="text-yellow-500 text-xs font-bold ml-2">No movement detected yet</Text>
            </View>
          )}
        </View>

        {/* Rep Test */}
        <View className="bg-gray-900 rounded-2xl p-4 mb-6">
          <Text className="text-gray-400 font-bold mb-4 uppercase tracking-widest text-xs">3. One-Rep Test</Text>

          {repTestState === 'idle' && (
            <>
              <Text className="text-gray-200 mb-4">
                Let's test one actual rep. Tap start, then do one slow, controlled glide of the board.
              </Text>
              <Pressable
                onPress={startRepTest}
                className="bg-orange-500 py-4 rounded-xl items-center active:bg-orange-600"
              >
                <Text className="text-white font-bold text-lg">Start Rep Test</Text>
              </Pressable>
            </>
          )}

          {repTestState === 'testing' && (
            <View className="items-center py-6">
              <ActivityIndicator color="#f97316" size="large" />
              <Text className="text-white font-bold text-xl mt-4">DO ONE REP NOW</Text>
              <Text className="text-gray-500 mt-2">I'm watching for movement...</Text>
            </View>
          )}

          {repTestState === 'result' && testResult && (
            <View>
              <Text className="text-white font-bold text-lg mb-2">Test Results:</Text>
              <View className="flex-row mb-4">
                <View className="flex-1 bg-gray-800 p-3 rounded-xl mr-2">
                  <Text className="text-gray-500 text-xs uppercase font-bold">Strength</Text>
                  <Text className="text-white text-xl font-bold">{testResult.peak.toFixed(2)}</Text>
                </View>
                <View className="flex-1 bg-gray-800 p-3 rounded-xl">
                  <Text className="text-gray-500 text-xs uppercase font-bold">Verdict</Text>
                  <Text className={testResult.peak > 0.4 ? "text-green-500 text-xl font-bold" : "text-red-500 text-xl font-bold"}>
                    {testResult.peak > 0.4 ? "GOOD" : "TOO WEAK"}
                  </Text>
                </View>
              </View>

              {testResult.peak <= 0.4 && (
                <Text className="text-gray-400 text-sm italic mb-4">
                  Tip: Your movement was very smooth. Try setting "Motion Sensitivity" to HIGH in settings.
                </Text>
              )}

              <Pressable
                onPress={startRepTest}
                className="border border-gray-700 py-3 rounded-xl items-center active:bg-gray-800"
              >
                <Text className="text-gray-400 font-bold">Retry Test</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Tips & Battery */}
        <View className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 mb-6">
          <Text className="text-orange-400 font-bold mb-2 uppercase tracking-widest text-xs">Important Tip</Text>
          <Text className="text-gray-300 leading-5">
            If your Android tablet is in <Text className="text-white font-bold">"Battery Saver"</Text> mode,
            it may slow down or disable the motion sensors to save power.
            Turn off Battery Saver for the best counting accuracy.
          </Text>
        </View>

        {/* Send Report */}
        <View className="mt-4 mb-20">
          <Text className="text-gray-500 text-xs text-center mb-4 px-6">
            Still having trouble? Send a technical report and we'll look into it for you.
          </Text>
          <Pressable
            onPress={sendReport}
            disabled={isSending}
            className={`flex-row items-center justify-center py-4 rounded-2xl ${isSending ? 'bg-gray-800' : 'bg-gray-800 active:bg-gray-700'}`}
          >
            {isSending ? (
              <ActivityIndicator color="#f97316" />
            ) : (
              <>
                <Send size={18} color="#f97316" />
                <Text className="text-orange-500 font-bold ml-2 text-lg">Send Diagnostic Report</Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
