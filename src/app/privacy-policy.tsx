import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, ShieldCheck, Mic, CreditCard, EyeOff, HeartPulse } from 'lucide-react-native';
import { useSettingsStore, useTextScaleSubscription } from '@/lib/settings';
import {
  STORE_NAME,
  STORE_COMPANY,
  STORE_ACCOUNT,
  STORE_FULL_NAME,
} from '@/lib/storePlatform';

const APP_NAME = 'Glideboard';
const LAST_UPDATED = 'June 30, 2026';
const CONTACT_EMAIL = 'RCaldwellrc1@hotmail.com';

interface Section {
  icon?: React.ComponentType<{ size?: number; color?: string }>;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
}

const SECTIONS: Section[] = [
  {
    icon: ShieldCheck,
    title: 'Information We Collect',
    paragraphs: ['The app collects a small amount of data to operate and improve itself:'],
    bullets: [
      `Anonymous device identifier — a random ID used to remember your subscription status and to count app usage. It is not tied to your name, email, or ${STORE_ACCOUNT}.`,
      'Display name / nickname — an optional name you may enter in your profile. This is only what you choose to type.',
      'Usage data — basic events such as when the app is opened and when a workout is started, used to understand how the app is used and improve it.',
      `Subscription records — whether you have an active subscription, so the app stays unlocked for you. Billing is handled by ${STORE_COMPANY}.`,
    ],
  },
  {
    icon: Mic,
    title: 'Microphone and Motion Data',
    paragraphs: [
      'Motion & fitness sensors are used to count your reps automatically. That happens entirely on your device — motion data is never recorded, stored, or transmitted.',
      'If you switch on Voice Counting or voice commands, the app records short clips (usually under two seconds) while a workout is running so it can hear the number you say. Each clip is sent over an encrypted connection to our server, which passes it to OpenAI’s speech-to-text service purely to turn the speech into text. Only the resulting text (for example, “eight”) comes back to the app.',
      'We do not keep the audio clips or the text, and neither is linked to your name or email. The microphone is only active while a voice-enabled workout is in progress — turning Voice Counting off in App Settings stops all audio capture.',
    ],
  },
  {
    title: 'How We Use Information',
    bullets: [
      'To operate core features of the app (e.g., unlocking purchased content, counting reps).',
      'To understand usage and improve the app (basic analytics).',
    ],
  },
  {
    icon: EyeOff,
    title: 'What We Do NOT Do',
    bullets: [
      'We do not sell your data.',
      'We do not share your data with advertisers or data brokers.',
      'We do not track you across other companies’ apps or websites.',
      'We do not require an account, email, or login.',
    ],
  },
  {
    icon: CreditCard,
    title: 'Payments',
    paragraphs: [
      `Purchases are processed by ${STORE_COMPANY} through ${STORE_NAME}. We never see or store your payment card or billing details — ${STORE_COMPANY} handles all of that under its own privacy policy.`,
    ],
  },
  {
    title: 'Data Retention',
    paragraphs: [
      'We keep the limited data described above only as long as needed to run the app. You can request deletion of your data at any time by contacting us at the email below.',
    ],
  },
  {
    title: 'Children’s Privacy',
    paragraphs: [
      'The app is not directed to children under 13, and we do not knowingly collect personal information from children.',
    ],
  },
  {
    title: 'Changes to This Policy',
    paragraphs: [
      'We may update this policy from time to time. Changes will be posted here with a new "Last updated" date.',
    ],
  },
];

export default function PrivacyPolicyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const largeDisplayMode = useSettingsStore(s => s.largeDisplayMode);
  useTextScaleSubscription(); // re-render when global text size changes

  return (
    <View className="flex-1 bg-black">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="flex-row items-center px-4 mt-4">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 items-center justify-center -ml-2"
          >
            <ChevronLeft size={28} color="#f97316" />
          </Pressable>
          <Text className={`text-white font-bold ml-1 ${largeDisplayMode ? 'text-2xl' : 'text-3xl'}`}>
            Privacy Policy
          </Text>
        </View>

        <Text className={`text-gray-500 px-4 mt-2 ${largeDisplayMode ? 'text-sm' : 'text-xs'}`}>
          Last updated: {LAST_UPDATED}
        </Text>

        {/* Intro */}
        <View className="mx-4 mt-4 bg-gray-900 rounded-2xl p-4">
          <Text className={`text-gray-300 leading-6 ${largeDisplayMode ? 'text-lg' : 'text-base'}`}>
            This Privacy Policy explains how {APP_NAME} ("we," "us," or "the app") handles
            information when you use our mobile application. We built this app to respect your
            privacy: there are no user accounts, and we collect as little as possible.
          </Text>
        </View>

        {/* Medical Disclaimer (highlighted) */}
        <View className="mx-4 mt-4 bg-orange-500/10 border border-orange-500/40 rounded-2xl p-4">
          <View className="flex-row items-center mb-2">
            <HeartPulse size={largeDisplayMode ? 22 : 20} color="#f97316" />
            <Text
              className={`text-orange-400 font-semibold ml-2 ${
                largeDisplayMode ? 'text-xl' : 'text-lg'
              }`}
            >
              Medical Disclaimer
            </Text>
          </View>
          <Text className={`text-gray-300 leading-6 ${largeDisplayMode ? 'text-lg' : 'text-base'}`}>
            {APP_NAME} and all of its content are provided for general fitness and entertainment
            purposes only and are not intended as medical advice. The app is not a substitute for
            professional medical guidance, diagnosis, or treatment. Always consult your doctor or
            another qualified healthcare professional before beginning any exercise program, and
            stop and seek medical attention if you experience pain, discomfort, or any other
            symptoms while exercising.
          </Text>
        </View>

        {/* Sections */}
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <View key={section.title} className="px-4 mt-6">
              <View className="flex-row items-center mb-2">
                {Icon && <Icon size={largeDisplayMode ? 22 : 20} color="#f97316" />}
                <Text
                  className={`text-white font-semibold ${Icon ? 'ml-2' : ''} ${
                    largeDisplayMode ? 'text-xl' : 'text-lg'
                  }`}
                >
                  {section.title}
                </Text>
              </View>

              {section.paragraphs?.map((p, i) => (
                <Text
                  key={i}
                  className={`text-gray-400 leading-6 mb-2 ${largeDisplayMode ? 'text-lg' : 'text-base'}`}
                >
                  {p}
                </Text>
              ))}

              {section.bullets?.map((b, i) => (
                <View key={i} className="flex-row mb-2 pr-2">
                  <Text className={`text-orange-500 mr-2 ${largeDisplayMode ? 'text-lg' : 'text-base'}`}>
                    {'•'}
                  </Text>
                  <Text
                    className={`text-gray-400 leading-6 flex-1 ${largeDisplayMode ? 'text-lg' : 'text-base'}`}
                  >
                    {b}
                  </Text>
                </View>
              ))}
            </View>
          );
        })}

        {/* Contact */}
        <View className="px-4 mt-6">
          <Text className={`text-white font-semibold mb-2 ${largeDisplayMode ? 'text-xl' : 'text-lg'}`}>
            Contact
          </Text>
          <Text className={`text-gray-400 leading-6 ${largeDisplayMode ? 'text-lg' : 'text-base'}`}>
            If you have any questions about this Privacy Policy, contact us at:
          </Text>
          <Text className={`text-orange-500 mt-1 ${largeDisplayMode ? 'text-lg' : 'text-base'}`}>
            {CONTACT_EMAIL}
          </Text>
        </View>

        <Text className={`text-gray-600 px-4 mt-8 ${largeDisplayMode ? 'text-sm' : 'text-xs'}`}>
          This policy applies to the {APP_NAME} mobile app available on the {STORE_FULL_NAME}.
        </Text>
      </ScrollView>
    </View>
  );
}
