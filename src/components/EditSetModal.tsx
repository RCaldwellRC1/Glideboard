import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, TextInput, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { Check, X, Trash2 } from 'lucide-react-native';

interface EditSetModalProps {
  visible: boolean;
  exercise: string;
  inclineLevel: number;
  setNumber: number;
  currentReps: number;
  onSave: (reps: number) => void;
  onDelete: () => void;
  onCancel: () => void;
  isLarge?: boolean;
}

export function EditSetModal({
  visible,
  exercise,
  inclineLevel,
  setNumber,
  currentReps,
  onSave,
  onDelete,
  onCancel,
  isLarge = false,
}: EditSetModalProps) {
  const [inputValue, setInputValue] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Prefill with the current count each time the modal opens.
  useEffect(() => {
    if (visible) {
      setInputValue(String(currentReps));
      setConfirmingDelete(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [visible, currentReps]);

  const handleSave = () => {
    const parsed = parseInt(inputValue, 10);
    onSave(!isNaN(parsed) && parsed >= 0 ? parsed : currentReps);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <Pressable
          onPress={onCancel}
          className="flex-1 bg-black/80 justify-center items-center px-6"
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="bg-gray-900 rounded-3xl w-full max-w-sm p-6"
          >
            {/* Close button */}
            <Pressable
              onPress={onCancel}
              className="absolute top-4 right-4 w-8 h-8 items-center justify-center"
            >
              <X size={24} color="#6b7280" />
            </Pressable>

            {/* Header */}
            <Text className={`text-white text-center font-bold mb-1 ${isLarge ? 'text-xl' : 'text-2xl'}`}>
              Edit Set {setNumber}
            </Text>
            <Text numberOfLines={1} adjustsFontSizeToFit className={`text-gray-500 text-center mb-6 ${isLarge ? 'text-sm' : 'text-base'}`}>
              {exercise} · Level {inclineLevel}
            </Text>

            {/* Input field */}
            <View className="items-center mb-2">
              <TextInput
                ref={inputRef}
                value={inputValue}
                onChangeText={setInputValue}
                keyboardType="number-pad"
                returnKeyType="done"
                onSubmitEditing={handleSave}
                selectTextOnFocus
                placeholder="0"
                placeholderTextColor="#6b7280"
                className={`text-orange-500 font-bold text-center bg-gray-800 rounded-xl px-6 py-4 ${isLarge ? 'text-5xl min-w-[160px]' : 'text-6xl min-w-[176px]'}`}
              />
            </View>
            <Text className={`text-gray-600 text-center mb-6 ${isLarge ? 'text-xs' : 'text-sm'}`}>reps</Text>

            {/* Save button */}
            <Pressable
              onPress={handleSave}
              className="bg-orange-500 rounded-xl py-4 flex-row items-center justify-center active:opacity-70"
            >
              <Check size={isLarge ? 20 : 22} color="white" />
              <Text className={`text-white font-bold ml-2 ${isLarge ? 'text-lg' : 'text-xl'}`}>
                Save
              </Text>
            </Pressable>

            {/* Delete action with inline confirm */}
            {confirmingDelete ? (
              <View className="mt-3">
                <Text className={`text-gray-400 text-center mb-2 ${isLarge ? 'text-sm' : 'text-base'}`}>
                  Delete this set?
                </Text>
                <View className="flex-row">
                  <Pressable
                    onPress={() => setConfirmingDelete(false)}
                    className="flex-1 mr-2 bg-gray-800 rounded-xl py-3 items-center active:opacity-70"
                  >
                    <Text numberOfLines={1} className={`text-gray-300 font-medium ${isLarge ? 'text-base' : 'text-lg'}`}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={onDelete}
                    className="flex-1 ml-2 bg-red-600 rounded-xl py-3 items-center active:opacity-70"
                  >
                    <Text numberOfLines={1} className={`text-white font-bold ${isLarge ? 'text-base' : 'text-lg'}`}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => setConfirmingDelete(true)}
                className="py-3 mt-2 flex-row items-center justify-center active:opacity-70"
              >
                <Trash2 size={isLarge ? 16 : 18} color="#ef4444" />
                <Text className={`text-red-500 ml-2 ${isLarge ? 'text-sm' : 'text-base'}`}>
                  Delete Set
                </Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
