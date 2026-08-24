import React from 'react';
import { View, Text, Pressable, ScrollView, Modal } from 'react-native';
import { ChevronDown, ChevronUp, X } from 'lucide-react-native';
import { INCLINE_LEVELS } from '@/lib/workout';
import { useTheme } from '@/lib/settings';

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
  const theme = useTheme();

  return (
    <View className={isLarge ? 'w-28 relative' : 'w-32 relative'}>
      <Text style={{ color: theme.subText }} className={`mb-1 tracking-wide ${isLarge ? 'text-xs' : 'text-sm'}`}>INCLINE</Text>
      <Pressable
        onPress={onToggle}
        style={{ backgroundColor: theme.card }}
        className={`rounded-lg flex-row items-center justify-between ${isLarge ? 'px-3 py-3' : 'px-4 py-3'}`}
      >
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: theme.text }} className={`font-semibold flex-1 mr-1 ${isLarge ? 'text-base' : 'text-lg'}`}>LVL {value}</Text>
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
            style={{ backgroundColor: theme.card, borderColor: theme.border }}
            className="rounded-3xl w-full max-w-sm overflow-hidden border"
            onStartShouldSetResponder={() => true}
            onResponderTerminationRequest={() => false}
          >
            <View style={{ borderBottomColor: theme.divider }} className="flex-row items-center justify-between px-6 py-4 border-b">
              <Text style={{ color: theme.text }} className="font-bold text-xl">Select Incline</Text>
              <Pressable onPress={onToggle} hitSlop={12}>
                <X size={24} color={theme.subText} />
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
                    style={{ color: value === level ? '#f97316' : theme.text }}
                    className="text-xl font-medium"
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
