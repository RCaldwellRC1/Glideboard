import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { Dumbbell, Delete, Check } from 'lucide-react-native';
import { categoryColor } from '@/lib/workout';
import { useTheme } from '@/lib/settings';

// Free-weight work can be anything from a 1 lb dumbbell to a 300+ lb barbell, so
// a dropdown doesn't fit. This shows the current weight in the same slot the
// Incline dropdown normally occupies and, when tapped, opens a numeric keypad
// for fast entry. Rendered in the Free Style category color (crimson red).
const RED = categoryColor('freestyle');

function KeypadModal({
  visible,
  initial,
  onClose,
  onSubmit,
  isLarge,
}: {
  visible: boolean;
  initial: number;
  onClose: () => void;
  onSubmit: (weight: number) => void;
  isLarge: boolean;
}) {
  const theme = useTheme();
  // Empty string = "haven't typed anything yet"; we show the current weight as a
  // dimmed placeholder until the first digit is pressed.
  const [text, setText] = useState('');

  useEffect(() => {
    if (visible) setText('');
  }, [visible]);

  const pressDigit = (d: string) => {
    setText(prev => {
      const next = (prev + d).replace(/^0+/, ''); // no leading zeros
      if (next.length > 3) return prev; // cap at 3 digits (max 500 clamped on submit)
      return next;
    });
  };

  const backspace = () => setText(prev => prev.slice(0, -1));

  const submit = () => {
    const n = parseInt(text, 10);
    onSubmit(!isNaN(n) && n > 0 ? n : initial);
  };

  const display = text === '' ? String(initial) : text;
  const rows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 bg-black/80 justify-center items-center px-6">
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{ backgroundColor: theme.card }}
          className="rounded-3xl w-full max-w-sm p-6"
        >
          {/* Header */}
          <View className="flex-row items-center justify-center mb-1">
            <Dumbbell size={isLarge ? 18 : 20} color={RED} />
            <Text className={`font-bold ml-2 ${isLarge ? 'text-lg' : 'text-xl'}`} style={{ color: RED }}>
              Set Weight
            </Text>
          </View>

          {/* Live display */}
          <View className="items-center mb-4">
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              className={`font-bold ${isLarge ? 'text-5xl' : 'text-6xl'}`}
              style={{ color: text === '' ? theme.subText : RED }}
            >
              {display}
              <Text style={{ color: theme.subText }} className={isLarge ? 'text-2xl' : 'text-3xl'}> lb</Text>
            </Text>
          </View>

          {/* Keypad */}
          {rows.map((row) => (
            <View key={row[0]} className="flex-row justify-between mb-3">
              {row.map((d) => (
                <Pressable
                  key={d}
                  onPress={() => pressDigit(d)}
                  style={{ backgroundColor: theme.background === '#ffffff' ? '#e5e7eb' : '#1f2937' }}
                  className={`flex-1 mx-1.5 rounded-2xl items-center justify-center active:opacity-60 ${isLarge ? 'py-4' : 'py-5'}`}
                >
                  <Text style={{ color: theme.text }} className={`font-bold ${isLarge ? 'text-2xl' : 'text-3xl'}`}>{d}</Text>
                </Pressable>
              ))}
            </View>
          ))}

          {/* Bottom row: backspace · 0 · confirm */}
          <View className="flex-row justify-between mb-1">
            <Pressable
              onPress={backspace}
              style={{ backgroundColor: theme.background === '#ffffff' ? '#e5e7eb' : '#1f2937' }}
              className={`flex-1 mx-1.5 rounded-2xl items-center justify-center active:opacity-60 ${isLarge ? 'py-4' : 'py-5'}`}
            >
              <Delete size={isLarge ? 22 : 26} color={theme.subText} />
            </Pressable>
            <Pressable
              onPress={() => pressDigit('0')}
              style={{ backgroundColor: theme.background === '#ffffff' ? '#e5e7eb' : '#1f2937' }}
              className={`flex-1 mx-1.5 rounded-2xl items-center justify-center active:opacity-60 ${isLarge ? 'py-4' : 'py-5'}`}
            >
              <Text style={{ color: theme.text }} className={`font-bold ${isLarge ? 'text-2xl' : 'text-3xl'}`}>0</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              className={`flex-1 mx-1.5 rounded-2xl items-center justify-center active:opacity-70 ${isLarge ? 'py-4' : 'py-5'}`}
              style={{ backgroundColor: RED }}
            >
              <Check size={isLarge ? 24 : 28} color="#fff" />
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function WeightInput({
  value,
  onSelect,
  isLarge,
}: {
  value: number;
  onSelect: (weight: number) => void;
  isLarge: boolean;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View className={isLarge ? 'w-28' : 'w-32'}>
      <Text style={{ color: theme.subText }} className={`mb-1 tracking-wide ${isLarge ? 'text-xs' : 'text-sm'}`}>WEIGHT</Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={{ backgroundColor: theme.card }}
        className={`rounded-lg flex-row items-center justify-between ${isLarge ? 'px-3 py-3' : 'px-4 py-3'}`}
      >
        <Text numberOfLines={1} adjustsFontSizeToFit className={`font-semibold flex-1 mr-1 ${isLarge ? 'text-base' : 'text-lg'}`} style={{ color: RED }}>
          {value} lb
        </Text>
        <Dumbbell size={isLarge ? 16 : 18} color={RED} />
      </Pressable>

      <KeypadModal
        visible={open}
        initial={value}
        onClose={() => setOpen(false)}
        onSubmit={(w) => {
          onSelect(w);
          setOpen(false);
        }}
        isLarge={isLarge}
      />
    </View>
  );
}
