import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, TextInput, Modal, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { Check, X, Sparkles, RotateCcw } from 'lucide-react-native';
import { useTheme } from '@/lib/settings';

interface RepConfirmationModalProps {
  visible: boolean;
  autoCount: number;
  onConfirm: (confirmedCount: number) => void;
  onDismiss: () => void;
  // When provided, shows a "Delete & Redo Set" action that throws this set away
  // (no reps recorded) and lets the user start the same set over.
  onRedo?: () => void;
  // When set, the modal switches to a short "we learned from that" confirmation
  // state instead of closing immediately. Lets the silent per-exercise learning
  // actually feel visible to the user. Cleared by calling onFinishFeedback.
  learningMessage?: string | null;
  onFinishFeedback?: () => void;
  isLarge?: boolean;
}

// How long the learning-feedback card stays up before auto-closing.
const FEEDBACK_DURATION_MS = 2000;

export function RepConfirmationModal({
  visible,
  autoCount,
  onConfirm,
  onDismiss,
  onRedo,
  learningMessage,
  onFinishFeedback,
  isLarge = false,
}: RepConfirmationModalProps) {
  const theme = useTheme();
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<TextInput>(null);

  const showingFeedback = !!learningMessage;

  // Reset state when modal opens - start with empty input
  useEffect(() => {
    if (visible) {
      setInputValue('');
      // Focus the input after a brief delay to ensure modal is rendered
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [visible]);

  // Auto-dismiss the learning-feedback card after a short beat so the user reads
  // it without having to tap anything.
  useEffect(() => {
    if (!showingFeedback) return;
    Keyboard.dismiss();
    const t = setTimeout(() => {
      onFinishFeedback?.();
    }, FEEDBACK_DURATION_MS);
    return () => clearTimeout(t);
  }, [showingFeedback, onFinishFeedback]);

  const handleConfirm = () => {
    Keyboard.dismiss();
    const parsed = parseInt(inputValue, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      onConfirm(parsed);
    } else {
      // If empty or invalid, use the auto count
      onConfirm(autoCount);
    }
  };

  const handleRedo = () => {
    Keyboard.dismiss();
    onRedo?.();
  };

  const handleBackdropPress = () => {
    if (showingFeedback) {
      onFinishFeedback?.();
    } else {
      onDismiss();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={showingFeedback ? onFinishFeedback : onDismiss}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <Pressable
          onPress={handleBackdropPress}
          className="flex-1 bg-black/80 justify-center items-center px-6"
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{ backgroundColor: theme.card }}
            className="rounded-3xl w-full max-w-sm p-6"
          >
            {showingFeedback ? (
              /* ---- Learning feedback state ---- */
              <View className="items-center py-2">
                <View className="w-16 h-16 rounded-full bg-orange-500/15 items-center justify-center mb-4">
                  <Sparkles size={isLarge ? 28 : 32} color="#f97316" />
                </View>
                <Text style={{ color: theme.text }} className={`text-center font-bold mb-2 ${isLarge ? 'text-xl' : 'text-2xl'}`}>
                  Got it — dialing it in
                </Text>
                <Text style={{ color: theme.subText }} className={`text-center ${isLarge ? 'text-sm' : 'text-base'}`}>
                  {learningMessage}
                </Text>
                <Pressable
                  onPress={onFinishFeedback}
                  className="bg-orange-500 rounded-xl py-3 px-8 mt-6 active:opacity-70"
                >
                  <Text className={`text-white font-bold ${isLarge ? 'text-base' : 'text-lg'}`}>
                    Done
                  </Text>
                </Pressable>
              </View>
            ) : (
              /* ---- Rep count entry state ---- */
              <>
                {/* Close button */}
                <Pressable
                  onPress={onDismiss}
                  className="absolute top-4 right-4 w-8 h-8 items-center justify-center"
                >
                  <X size={24} color={theme.subText} />
                </Pressable>

                {/* Header */}
                <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: theme.text }} className={`text-center font-bold mb-2 ${isLarge ? 'text-xl' : 'text-2xl'}`}>
                  Enter your Rep count
                </Text>

                {/* Auto count hint */}
                <Text style={{ color: theme.subText }} className={`text-center mb-4 ${isLarge ? 'text-sm' : 'text-base'} opacity-80`}>
                  We counted {autoCount} reps
                </Text>

                {/* Input field */}
                <View className="items-center mb-4">
                  <TextInput
                    ref={inputRef}
                    value={inputValue}
                    onChangeText={setInputValue}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    onSubmitEditing={handleConfirm}
                    placeholder="0"
                    placeholderTextColor={theme.subText}
                    style={{ backgroundColor: theme.background === '#ffffff' ? '#f3f4f6' : '#1f2937' }}
                    className={`text-orange-500 font-bold text-center rounded-xl px-6 py-3 ${isLarge ? 'text-4xl min-w-[150px]' : 'text-5xl min-w-[168px]'}`}
                  />
                </View>

                {/* Confirm button */}
                <Pressable
                  onPress={handleConfirm}
                  className="bg-orange-500 rounded-xl py-4 flex-row items-center justify-center active:opacity-70"
                >
                  <Check size={isLarge ? 20 : 22} color="white" />
                  <Text className={`text-white font-bold ml-2 ${isLarge ? 'text-base' : 'text-lg'}`}>
                    Confirm
                  </Text>
                </Pressable>

                {/* Delete & redo — for when this set was ended by mistake */}
                {onRedo && (
                  <Pressable
                    onPress={handleRedo}
                    style={{ borderColor: 'rgba(239,68,68,0.4)' }}
                    className="mt-3 rounded-xl py-3 flex-row items-center justify-center border active:opacity-70"
                  >
                    <RotateCcw size={isLarge ? 16 : 18} color="#f87171" />
                    <Text className={`text-red-400 font-semibold ml-2 ${isLarge ? 'text-sm' : 'text-base'}`}>
                      Delete & Redo Set
                    </Text>
                  </Pressable>
                )}

                {/* Skip action */}
                <Pressable
                  onPress={onDismiss}
                  className="py-2 mt-1 items-center active:opacity-70"
                >
                  <Text style={{ color: theme.subText }} className={`${isLarge ? 'text-sm' : 'text-base'} opacity-60`}>
                    Skip
                  </Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
