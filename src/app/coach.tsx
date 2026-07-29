import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Check, TriangleAlert, ClipboardList, Plus, Trash2, Pencil, NotebookText, CalendarDays } from 'lucide-react-native';
import { useCoachStore, COACH_ROUTINES, COACH_PROGRAMS, type CoachRoutine } from '@/lib/coach';
import { useSettingsStore, useTextScaleSubscription } from '@/lib/settings';
import { remoteLog } from '@/lib/remoteLog';

export default function CoachScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const largeDisplayMode = useSettingsStore(s => s.largeDisplayMode);
  useTextScaleSubscription();
  const loadSettings = useSettingsStore(s => s.loadFromStorage);

  const acknowledged = useCoachStore(s => s.acknowledged);
  const isLoaded = useCoachStore(s => s.isLoaded);
  const loadCoach = useCoachStore(s => s.loadFromStorage);
  const acknowledge = useCoachStore(s => s.acknowledge);
  const customRoutines = useCoachStore(s => s.customRoutines);
  const deleteCustomRoutine = useCoachStore(s => s.deleteCustomRoutine);

  const [checked, setChecked] = useState(false);
  // The custom routine pending deletion (shown in the confirm modal).
  const [pendingDelete, setPendingDelete] = useState<CoachRoutine | null>(null);

  useEffect(() => {
    loadSettings();
    loadCoach();
  }, []);

  useEffect(() => {
    if (isLoaded) {
      remoteLog('coach_opened', { acknowledged });
    }
  }, [isLoaded]);

  const handleAcknowledge = () => {
    if (!checked) return;
    remoteLog('coach_disclaimer_acknowledged', {});
    // The first routine's id is fine as the acknowledgment context.
    acknowledge(COACH_ROUTINES[0]?.id ?? '');
  };

  // While loading, render a neutral screen to avoid flashing the disclaimer.
  if (!isLoaded) {
    return <View className="flex-1 bg-black" style={{ paddingTop: insets.top }} />;
  }

  return (
    <View className="flex-1 bg-black" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center px-3 py-2">
        <Pressable onPress={() => router.back()} hitSlop={12} className="active:opacity-60 p-1">
          <ChevronLeft size={largeDisplayMode ? 26 : 30} color="#f97316" />
        </Pressable>
        <Text className={`text-white font-bold ml-1 ${largeDisplayMode ? 'text-xl' : 'text-2xl'}`}>
          Coach's Routines
        </Text>
      </View>

      {!acknowledged ? (
        // ---- Disclaimer gate ----
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="items-center mt-2 mb-4">
            <View className="w-20 h-20 rounded-full bg-red-500/15 items-center justify-center">
              <TriangleAlert size={44} color="#ef4444" />
            </View>
            <Text className={`text-white font-bold mt-4 text-center ${largeDisplayMode ? 'text-2xl' : 'text-3xl'}`}>
              Please Read Carefully
            </Text>
          </View>

          <View className="bg-gray-900 rounded-2xl p-5 border border-red-500/30">
            <Text className={`text-gray-200 leading-7 ${largeDisplayMode ? 'text-base' : 'text-lg'}`}>
              Coach's Routines are provided{' '}
              <Text className="text-red-400 font-bold">for fun and entertainment purposes only</Text>.
              They are <Text className="font-bold text-white">not</Text> medical advice, a treatment plan,
              or a substitute for professional guidance.
              {'\n\n'}
              <Text className="font-bold text-white">
                Consult your physician or a qualified medical professional before starting this — or any —
                exercise routine.
              </Text>{' '}
              Stop immediately and seek help if you feel pain, dizziness, shortness of breath, or any other
              warning sign.
              {'\n\n'}
              By continuing, you confirm that you are voluntarily participating and that you{' '}
              <Text className="font-bold text-white">assume all risk</Text> of injury. You agree that the app
              and its creators are not responsible or liable for any injury, harm, or loss that may result.
            </Text>
          </View>

          {/* Acknowledgment checkbox */}
          <Pressable
            onPress={() => setChecked(v => !v)}
            className="flex-row items-start mt-6 px-1 active:opacity-70"
          >
            <View
              className={`w-7 h-7 rounded-md items-center justify-center mr-3 mt-0.5 ${
                checked ? 'bg-orange-500' : 'bg-gray-800 border border-gray-600'
              }`}
            >
              {checked && <Check size={18} color="#fff" />}
            </View>
            <Text className={`text-gray-200 flex-1 leading-6 ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>
              I have read and understand this disclaimer, I have (or will) consult my physician, and I agree
              to the terms above.
            </Text>
          </Pressable>

          <Pressable
            onPress={handleAcknowledge}
            disabled={!checked}
            className={`mt-6 py-4 rounded-xl items-center ${checked ? 'bg-orange-500 active:opacity-80' : 'bg-gray-800'}`}
          >
            <Text className={`font-bold ${checked ? 'text-white' : 'text-gray-600'} ${largeDisplayMode ? 'text-lg' : 'text-xl'}`}>
              I Acknowledge & Continue
            </Text>
          </Pressable>

          <Text className={`text-gray-600 text-center mt-3 ${largeDisplayMode ? 'text-xs' : 'text-sm'}`}>
            Your acknowledgment and the date are saved to your account.
          </Text>
        </ScrollView>
      ) : (
        // ---- Routine list ----
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
        >
          <Text className={`text-gray-400 mb-4 ${largeDisplayMode ? 'text-base' : 'text-lg'}`}>
            Coach-built programs to follow along with. Pick one to get started.
          </Text>

          {/* Multi-week programs (several workouts you rotate through) */}
          {COACH_PROGRAMS.length > 0 && (
            <Text className={`text-gray-500 font-semibold mb-2 tracking-wide ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>
              PROGRAMS
            </Text>
          )}
          {COACH_PROGRAMS.map(program => (
            <Pressable
              key={program.id}
              onPress={() => router.push(`/coach-program?id=${program.id}`)}
              className="bg-gray-900 rounded-2xl p-4 mb-3 border border-emerald-500/40 flex-row items-center active:opacity-80"
            >
              <View className="w-12 h-12 rounded-xl bg-emerald-900/40 items-center justify-center mr-3">
                <CalendarDays size={26} color="#10b981" />
              </View>
              <View className="flex-1 mr-2">
                <Text className={`text-white font-bold ${largeDisplayMode ? 'text-lg' : 'text-xl'}`}>
                  {program.title}
                </Text>
                <Text className={`text-gray-500 mt-0.5 ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>
                  {program.subtitle}
                </Text>
              </View>
              <ChevronRight size={largeDisplayMode ? 22 : 24} color="#6b7280" />
            </Pressable>
          ))}

          {/* Single routines */}
          {COACH_ROUTINES.length > 0 && (
            <Text className={`text-gray-500 font-semibold mt-4 mb-2 tracking-wide ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>
              ROUTINES
            </Text>
          )}
          {COACH_ROUTINES.map(routine => (
            <Pressable
              key={routine.id}
              onPress={() => router.push(`/coach-routine?id=${routine.id}`)}
              className="bg-gray-900 rounded-2xl p-4 mb-3 border border-orange-500/40 flex-row items-center active:opacity-80"
            >
              <View className="w-12 h-12 rounded-xl bg-orange-900/40 items-center justify-center mr-3">
                <ClipboardList size={26} color="#f97316" />
              </View>
              <View className="flex-1 mr-2">
                <Text className={`text-white font-bold ${largeDisplayMode ? 'text-lg' : 'text-xl'}`}>
                  {routine.title}
                </Text>
                <Text className={`text-gray-500 mt-0.5 ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>
                  {routine.subtitle}
                </Text>
              </View>
              <ChevronRight size={largeDisplayMode ? 22 : 24} color="#6b7280" />
            </Pressable>
          ))}

          {/* User-built routines saved on this device */}
          {customRoutines.length > 0 && (
            <Text className={`text-gray-500 font-semibold mt-4 mb-2 tracking-wide ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>
              YOUR ROUTINES
            </Text>
          )}
          {customRoutines.map(routine => (
            <Pressable
              key={routine.id}
              onPress={() => router.push(`/coach-routine?id=${routine.id}`)}
              className="bg-gray-900 rounded-2xl p-4 mb-3 border border-sky-500/40 flex-row items-center active:opacity-80"
            >
              <View className="w-12 h-12 rounded-xl bg-sky-900/40 items-center justify-center mr-3">
                <NotebookText size={26} color="#38bdf8" />
              </View>
              <View className="flex-1 mr-2">
                <Text className={`text-white font-bold ${largeDisplayMode ? 'text-lg' : 'text-xl'}`}>
                  {routine.title}
                </Text>
                <Text className={`text-gray-500 mt-0.5 ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>
                  {routine.subtitle}
                </Text>
              </View>
              {/* Edit (pencil) stacked above delete (trash) */}
              <View className="items-center">
                <Pressable
                  onPress={() => router.push(`/coach-build?id=${routine.id}`)}
                  hitSlop={12}
                  className="p-2 active:opacity-60"
                >
                  <Pencil size={largeDisplayMode ? 20 : 22} color="#38bdf8" />
                </Pressable>
                <Pressable
                  onPress={() => setPendingDelete(routine)}
                  hitSlop={12}
                  className="p-2 active:opacity-60"
                >
                  <Trash2 size={largeDisplayMode ? 20 : 22} color="#6b7280" />
                </Pressable>
              </View>
            </Pressable>
          ))}

          {/* Build your own */}
          <Pressable
            onPress={() => router.push('/coach-build')}
            className="mt-2 rounded-2xl p-4 border-2 border-dashed border-orange-500/50 flex-row items-center justify-center active:opacity-80"
          >
            <Plus size={largeDisplayMode ? 20 : 22} color="#f97316" />
            <Text className={`text-orange-500 font-bold ml-2 ${largeDisplayMode ? 'text-base' : 'text-lg'}`}>
              Build Your Own Routine
            </Text>
          </Pressable>
        </ScrollView>
      )}

      {/* Delete confirmation */}
      <Modal visible={pendingDelete !== null} transparent animationType="fade" onRequestClose={() => setPendingDelete(null)}>
        <View className="flex-1 bg-black/70 items-center justify-center px-8">
          <View className="w-full bg-gray-900 rounded-2xl p-6 border border-gray-700">
            <Text className={`text-white font-bold text-center ${largeDisplayMode ? 'text-lg' : 'text-xl'}`}>
              Delete routine?
            </Text>
            <Text className={`text-gray-400 text-center mt-2 leading-6 ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>
              "{pendingDelete?.title}" will be removed from this device, along with its trophies. This can't be undone.
            </Text>
            <View className="flex-row mt-6">
              <Pressable
                onPress={() => setPendingDelete(null)}
                className="flex-1 mr-2 py-3.5 rounded-xl items-center bg-gray-800 active:opacity-80"
              >
                <Text className={`text-gray-200 font-semibold ${largeDisplayMode ? 'text-base' : 'text-lg'}`}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (pendingDelete) deleteCustomRoutine(pendingDelete.id);
                  setPendingDelete(null);
                }}
                className="flex-1 ml-2 py-3.5 rounded-xl items-center bg-red-500 active:opacity-80"
              >
                <Text className={`text-white font-bold ${largeDisplayMode ? 'text-base' : 'text-lg'}`}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
