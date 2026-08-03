import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { INCLINE_LEVELS } from '@/lib/workout';

// Incline-level picker shared by the Tracker and the Coach Routine runner. The
// open/closed state is controlled by the parent so it can coordinate with other
// dropdowns on the screen.
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
    <View className={isLarge ? 'w-28 relative' : 'w-32 relative'} style={{ zIndex: 50 }}>
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

      {isOpen && (
        <View
          className={`absolute left-0 right-0 bg-gray-900 rounded-lg z-50 overflow-hidden shadow-lg shadow-black/50 ${isLarge ? 'top-14' : 'top-16'}`}
          style={{ elevation: 5 }}
        >
          <ScrollView
            showsVerticalScrollIndicator={true}
            persistentScrollbar={true}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingVertical: 4 }}
            style={{ maxHeight: 384 }}
          >
            {INCLINE_LEVELS.map((level) => (
              <Pressable
                key={level}
                onPress={() => {
                  onSelect(level);
                  onToggle();
                }}
                className={`px-4 ${isLarge ? 'py-2.5' : 'py-3'} ${value === level ? 'bg-gray-800' : ''}`}
              >
                <Text
                  className={`${isLarge ? 'text-base' : 'text-lg'} ${
                    value === level ? 'text-orange-500' : 'text-white'
                  }`}
                >
                  LEVEL {level}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}
