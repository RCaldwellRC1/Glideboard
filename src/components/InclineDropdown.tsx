import React from 'react';
import { View, Text, Pressable, ScrollView, Modal } from 'react-native';
import { ChevronDown, ChevronUp, X } from 'lucide-react-native';
import { INCLINE_LEVELS } from '@/lib/workout';

// Incline-level picker shared by the Tracker and the Coach Routine runner.
export function InclineDropdown({
  value,
  onSelect,
  isOpen,
  onToggle,
  isLarge,
}: {
  value: number;
  onSelect: (level: number) => void;
  isOpen: boolean;
  onToggle: () => void;
  isLarge: boolean;
}) {
  return (
    <View className={isLarge ? 'w-28 relative' : 'w-32 relative'}>
      <Text className={`text-gray-500 mb-1 tracking-wide ${isLarge ? 'text-xs' : 'text-sm'}`}>INCLINE</Text>
      <Pressable
        onPress={onToggle}
        className={`bg-gray-900 rounded-lg flex-row items-center justify-between ${isLarge ? 'px-3 py-3' : 'px-4 py-3'}`}
      >
        <Text numberOfLines={1} adjustsFontSizeToFit className={`text-white font-semibold flex-1 mr-1 ${isLarge ? 'text-base' : 'text-lg'}`}>LVL {value}</Text>
        {isOpen ? (
          <ChevronUp size={isLarge ? 18 : 20} color="#f97316" />
        ) : (
          <ChevronDown size={isLarge ? 18 : 20} color="#f97316" />
        )}
      </Pressable>

      <Modal
        visible={isOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={onToggle}
      >
        <Pressable
          className="flex-1 bg-black/60 items-center justify-center p-6"
          onPress={onToggle}
        >
          <View
            className="bg-gray-900 rounded-3xl w-full max-w-sm overflow-hidden border border-gray-800"
            onStartShouldSetResponder={() => true}
            onResponderTerminationRequest={() => false}
          >
            <View className="flex-row items-center justify-between px-6 py-4 border-b border-gray-800">
              <Text className="text-white font-bold text-xl">Select Incline</Text>
              <Pressable onPress={onToggle} hitSlop={12}>
                <X size={24} color="#6b7280" />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={true}
              persistentScrollbar={true}
              contentContainerStyle={{ paddingVertical: 12 }}
              style={{ maxHeight: 400 }}
            >
              {INCLINE_LEVELS.map((level) => (
                <Pressable
                  key={level}
                  onPress={() => {
                    onSelect(level);
                    onToggle();
                  }}
                  className={`px-8 py-4 ${value === level ? 'bg-orange-500/10' : ''}`}
                >
                  <Text
                    className={`text-xl font-medium ${
                      value === level ? 'text-orange-500' : 'text-white'
                    }`}
                  >
                    Level {level}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
