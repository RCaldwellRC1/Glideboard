import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Keyboard, Modal } from 'react-native';
import { ChevronLeft, ChevronRight, Plus, Check, ClipboardList, X } from 'lucide-react-native';
import {
  EXERCISE_GROUPS,
  CUSTOM_CATEGORY_GROUPS,
  FREE_STYLE_GROUP,
  TIMED_GROUP,
  categoryColor,
} from '@/lib/workout';
import { useTheme } from '@/lib/settings';

interface ExercisePickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (exercise: string, group: string) => void;
  isLarge: boolean;
  customExercises: Record<string, string[]>;
  onAddCustom: (group: string, name: string) => void;
  onRenameCustom: (group: string, oldName: string, newName: string) => void;
  onOpenCoach?: () => void;
  title?: string;
  showCoachRoutines?: boolean;
}

// A single "Press and hold to add Exercize" slot. After a 2-second long press
// the keyboard appears and the user types a new exercise name; pressing
// Return/Enter (or the green checkmark) creates it.
function AddExerciseSlot({
  group,
  onAdd,
  isLarge,
  color = '#22c55e',
}: {
  group: string;
  onAdd: (group: string, name: string) => void;
  isLarge: boolean;
  color?: string;
}) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');

  const commit = () => {
    const name = text.trim();
    if (name.length > 0) {
      onAdd(group, name);
    }
    setText('');
    setEditing(false);
    Keyboard.dismiss();
  };

  if (editing) {
    return (
      <View style={{ backgroundColor: theme.background === '#ffffff' ? '#f3f4f6' : '#1f2937' }} className={`flex-row items-center px-4 ${isLarge ? 'py-2' : 'py-2.5'}`}>
        <TextInput
          value={text}
          onChangeText={setText}
          autoFocus
          placeholder="Type exercise name"
          placeholderTextColor={theme.subText}
          returnKeyType="done"
          autoCapitalize="words"
          onSubmitEditing={commit}
          onBlur={() => {
            if (text.trim().length === 0) setEditing(false);
          }}
          className={`flex-1 ${isLarge ? 'text-base' : 'text-lg'}`}
          style={{ color }}
        />
        <Pressable onPress={commit} hitSlop={12} className="ml-2 active:opacity-60">
          <Check size={isLarge ? 20 : 22} color={color} />
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      delayLongPress={2000}
      onLongPress={() => setEditing(true)}
      className={`px-4 ${isLarge ? 'py-2.5' : 'py-3'} flex-row items-center active:opacity-60`}
      style={{ backgroundColor: theme.card }}
    >
      <Plus size={isLarge ? 14 : 16} color={color} />
      <Text className={`italic ml-2 ${isLarge ? 'text-sm' : 'text-base'}`} style={{ color: `${color}b3` }}>
        Press and hold to add Exercize
      </Text>
    </Pressable>
  );
}

// A green user-created exercise row. Tap to select it; press and hold to edit
// its name (fixes typos). Editing mirrors the AddExerciseSlot flow.
function CustomExerciseRow({
  exercise,
  group,
  onSelect,
  onRename,
  isLarge,
  color = '#22c55e',
}: {
  exercise: string;
  group: string;
  onSelect: (exercise: string, group: string) => void;
  onRename: (group: string, oldName: string, newName: string) => void;
  isLarge: boolean;
  color?: string;
}) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(exercise);

  const commit = () => {
    const name = text.trim();
    if (name.length > 0 && name !== exercise) {
      onRename(group, exercise, name);
    }
    setEditing(false);
    Keyboard.dismiss();
  };

  if (editing) {
    return (
      <View style={{ backgroundColor: theme.background === '#ffffff' ? '#f3f4f6' : '#1f2937' }} className={`flex-row items-center px-4 ${isLarge ? 'py-2' : 'py-2.5'}`}>
        <TextInput
          value={text}
          onChangeText={setText}
          autoFocus
          placeholder="Exercise name"
          placeholderTextColor={theme.subText}
          returnKeyType="done"
          autoCapitalize="words"
          onSubmitEditing={commit}
          onBlur={commit}
          className={`flex-1 ${isLarge ? 'text-base' : 'text-lg'}`}
          style={{ color }}
        />
        <Pressable onPress={commit} hitSlop={12} className="ml-2 active:opacity-60">
          <Check size={isLarge ? 20 : 22} color={color} />
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => onSelect(exercise, group)}
      delayLongPress={500}
      onLongPress={() => {
        setText(exercise);
        setEditing(true);
      }}
      className={`px-4 ${isLarge ? 'py-2.5' : 'py-3'} active:opacity-60`}
      style={{ backgroundColor: theme.card }}
    >
      <Text
        className={`font-semibold ${isLarge ? 'text-base' : 'text-lg'}`}
        style={{ color }}
      >
        {exercise}
      </Text>
    </Pressable>
  );
}

const DROPDOWN_SECTIONS = [
  ...EXERCISE_GROUPS.map(g => ({ name: g.name, exercises: g.exercises, color: '#f97316' })),
  ...CUSTOM_CATEGORY_GROUPS.map(g => ({
    name: g.name,
    exercises: g.exercises,
    color: g.name === FREE_STYLE_GROUP ? '#e11d48' : '#a855f7'
  }))
];

export function ExercisePickerModal({
  visible,
  onClose,
  onSelect,
  isLarge,
  customExercises,
  onAddCustom,
  onRenameCustom,
  onOpenCoach,
  title = 'Select Category',
  showCoachRoutines = true,
}: ExercisePickerModalProps) {
  const theme = useTheme();
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setExpandedGroup(null);
  }, [visible]);

  const activeGroup = DROPDOWN_SECTIONS.find(g => g.name === expandedGroup) ?? null;
  const groupCustom = expandedGroup ? customExercises[expandedGroup] ?? [] : [];
  const isCustomCategory =
    expandedGroup === FREE_STYLE_GROUP || expandedGroup === TIMED_GROUP;

  const bodyGroups = DROPDOWN_SECTIONS.filter(g => g.color === '#f97316');
  const customCats = DROPDOWN_SECTIONS.filter(g => g.color !== '#f97316');

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 bg-black/60 items-center justify-center p-6"
        onPress={onClose}
      >
        <View
          style={{ backgroundColor: theme.card, borderColor: theme.border }}
          className="rounded-3xl w-full max-w-lg overflow-hidden border"
          onStartShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
        >
          <View style={{ borderBottomColor: theme.divider }} className="flex-row items-center justify-between px-6 py-4 border-b">
            <View className="flex-row items-center">
              {expandedGroup !== null && (
                <Pressable onPress={() => setExpandedGroup(null)} hitSlop={12} className="mr-3">
                  <ChevronLeft size={24} color="#f97316" />
                </Pressable>
              )}
              <Text style={{ color: theme.text }} className="font-bold text-xl">
                {expandedGroup === null ? title : expandedGroup}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <X size={24} color={theme.subText} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={true}
            persistentScrollbar={true}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingVertical: 12 }}
            style={{ maxHeight: 500 }}
          >
            {activeGroup === null ? (
              <>
                {bodyGroups.map((group) => (
                  <Pressable
                    key={group.name}
                    onPress={() => setExpandedGroup(group.name)}
                    style={{ backgroundColor: theme.background === '#ffffff' ? '#f3f4f6' : '#1f2937' }}
                    className="mx-4 px-4 py-4 rounded-xl flex-row items-center justify-between active:opacity-60 mb-1"
                  >
                    <Text className="text-xl font-bold" style={{ color: group.color }}>
                      {group.name}
                    </Text>
                    <ChevronRight size={22} color={group.color} />
                  </Pressable>
                ))}

                <View style={{ borderTopColor: theme.divider }} className="my-2 mx-6 border-t" />

                {customCats.map((group) => (
                  <Pressable
                    key={group.name}
                    onPress={() => setExpandedGroup(group.name)}
                    style={{ backgroundColor: theme.background === '#ffffff' ? '#f3f4f6' : '#1f2937' }}
                    className="mx-4 px-4 py-4 rounded-xl flex-row items-center justify-between active:opacity-60 mb-1"
                  >
                    <Text className="text-xl font-bold" style={{ color: group.color }}>
                      {group.name}
                    </Text>
                    <ChevronRight size={22} color={group.color} />
                  </Pressable>
                ))}

                {showCoachRoutines && onOpenCoach && (
                  <>
                    <View style={{ borderTopColor: theme.divider }} className="my-2 mx-6 border-t" />
                    <Pressable
                      onPress={() => {
                        onClose();
                        onOpenCoach();
                      }}
                      style={{ backgroundColor: theme.background === '#ffffff' ? '#f3f4f6' : '#1f2937' }}
                      className="mx-4 px-4 py-4 rounded-xl flex-row items-center justify-between active:opacity-60"
                    >
                      <View className="flex-row items-center flex-1 mr-2">
                        <ClipboardList size={22} color="#22c55e" />
                        <Text numberOfLines={1} className="text-green-500 font-bold ml-3 text-xl">
                          Coach's Routines
                        </Text>
                      </View>
                      <ChevronRight size={22} color="#22c55e" />
                    </Pressable>
                  </>
                )}
              </>
            ) : (
              <>
                {activeGroup.exercises.map((exercise) => (
                  <Pressable
                    key={exercise}
                    onPress={() => {
                      onSelect(exercise, activeGroup.name);
                    }}
                    className="px-8 py-4 active:opacity-60"
                    style={{ backgroundColor: theme.card }}
                  >
                    <Text style={{ color: theme.text }} className="text-xl font-medium">
                      {exercise}
                    </Text>
                  </Pressable>
                ))}

                {isCustomCategory && groupCustom.length === 0 ? (
                  <Text style={{ color: theme.subText }} className="px-8 py-4 italic text-base">
                    {expandedGroup === TIMED_GROUP
                      ? 'Add a hold like “Plank” or “Wall Sit”.'
                      : 'Add your own lift or calisthenic move.'}
                  </Text>
                ) : null}

                {groupCustom.map((exercise) => (
                  <CustomExerciseRow
                    key={exercise}
                    exercise={exercise}
                    group={activeGroup.name}
                    onSelect={onSelect}
                    onRename={onRenameCustom}
                    isLarge={isLarge}
                    color={activeGroup.color}
                  />
                ))}

                <View className="mt-2">
                  <AddExerciseSlot group={activeGroup.name} onAdd={onAddCustom} isLarge={isLarge} color={activeGroup.color} />
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}
