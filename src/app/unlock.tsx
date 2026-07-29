import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Check, X, RefreshCw, CalendarClock } from 'lucide-react-native';
import {
  useUnlockState,
  usePurchaseSubscription,
  useRestoreSubscription,
  MONTHLY_PRICE,
  ANNUAL_PRICE,
  isStoreConfigured,
  type PlanId,
} from '@/lib/purchases';
import { remoteLog } from '@/lib/remoteLog';
import {
  STORE_NAME,
  STORE_SETTINGS,
  STORE_ACCOUNT,
  TERMS_URL,
} from '@/lib/storePlatform';

const MEMBERSHIP_BENEFITS = [
  'Full access to every workout & program',
  'Automatic rep counting by motion & voice',
  'All updates included while your subscription is active',
  `Cancel anytime — manage it in your ${STORE_SETTINGS}`,
];

// Default route entry for /unlock — preview is driven by the ?preview=1 query param.
export default function UnlockScreen() {
  const params = useLocalSearchParams<{ preview?: string }>();
  return <Paywall preview={params.preview === '1'} />;
}

// The paywall body. `preview` renders the full sales paywall as a brand-new
// customer would see it (ignoring ownership) and lays it out to fit a single
// screen — scaled down if needed — so an App Store screenshot captures
// everything with nothing clipped. No real/simulated purchase runs in preview.
export function Paywall({ preview = false }: { preview?: boolean }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const previewMode = preview;
  const { data: state } = useUnlockState();
  const subscribe = usePurchaseSubscription();
  const restore = useRestoreSubscription();

  // Which plan the user has selected. Defaults to the annual (best-value) plan.
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('annual');

  // Fit-to-screen state for preview: measure the available height and the
  // paywall's natural height, then scale (uniformly — never stretched) so the
  // whole paywall always lands inside one screen with nothing clipped. The 0.97
  // safety factor guards against sub-pixel rounding that could shave an edge.
  const [availH, setAvailH] = useState(0);
  const [contentH, setContentH] = useState(0);
  const fitScale =
    previewMode && availH > 0 && contentH > 0 ? Math.min(1, (availH / contentH) * 0.97) : 1;

  // --- Funnel analytics -----------------------------------------------------
  // Log a paywall view exactly once when a real (non-preview) user reaches this
  // screen. Combined with `subscribe_tapped` below and the rc_purchase_* events
  // from lib/purchases.ts, this reconstructs the full drop-off funnel:
  //   paywall_viewed → subscribe_tapped → rc_offerings → purchase result/cancel/error
  useEffect(() => {
    if (preview) {
      // Logged so we can confirm from the LOGS tab that the screenshot preview
      // actually opened (rather than the ordinary paywall).
      remoteLog('paywall_preview_opened', {});
      return;
    }
    remoteLog('paywall_viewed', { storeConfigured: isStoreConfigured });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  // Closing via the X / back gesture. Logged separately from `close` (which is
  // also called right after a successful purchase) so a dismissal here means
  // "saw the paywall but left without buying" — the key top-of-funnel drop-off.
  const dismiss = () => {
    if (!previewMode) remoteLog('paywall_dismissed', {});
    close();
  };

  const handleSubscribe = async () => {
    if (previewMode) {
      Alert.alert('Preview only', 'This is a preview of the paywall for your store screenshot. No purchase is made here.');
      return;
    }
    remoteLog('subscribe_tapped', { plan: selectedPlan });
    try {
      const { purchased } = await subscribe.mutateAsync(selectedPlan);
      // The user cancelled the store's purchase sheet — quietly do nothing.
      if (!purchased) return;
      const priceLine =
        selectedPlan === 'monthly'
          ? `It's ${MONTHLY_PRICE} a month and renews automatically each month`
          : `It's ${ANNUAL_PRICE} a year and renews automatically each year`;
      Alert.alert(
        "You're all set! 🎉",
        `Your subscription is active — everything is unlocked. ${priceLine} so you never lose access. You can cancel anytime in your ${STORE_SETTINGS}.`,
        [{ text: 'Great', onPress: close }]
      );
    } catch (err) {
      Alert.alert('Purchase failed', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  const handleRestore = async () => {
    if (previewMode) {
      Alert.alert('Preview only', 'This is a preview of the paywall for your store screenshot.');
      return;
    }
    try {
      const { restored } = await restore.mutateAsync();
      if (restored) {
        Alert.alert('Subscription Restored', 'Your access has been restored.', [{ text: 'OK', onPress: close }]);
      } else {
        Alert.alert('Nothing to Restore', 'We could not find an active subscription for this account.');
      }
    } catch (err) {
      Alert.alert('Restore failed', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  const subscriptionActive = state?.subscriptionActive ?? false;
  const busy = subscribe.isPending || restore.isPending;

  // Only a real, active PAID subscription removes the "buy" option. In preview
  // mode we always render the full sales paywall so a screenshot can be captured.
  const hasPaidSubscription = !previewMode && subscriptionActive;
  // Show the benefits / price / subscribe button whenever there's no active paid
  // subscription (i.e. always, except for an existing paid subscriber).
  const showSales = !hasPaidSubscription;

  // The paywall content — shared between normal (scrollable) and preview
  // (fit-to-screen) layouts.
  const body = (
    <>
      {/* Crest */}
      <View className={`items-center ${previewMode ? '-mt-2' : 'mt-2'}`}>
        <View
          className={`rounded-3xl items-center justify-center border bg-orange-500/15 border-orange-500/40 ${
            previewMode ? 'w-16 h-16' : 'w-24 h-24'
          }`}
        >
          <CalendarClock size={previewMode ? 34 : 50} color="#f97316" />
        </View>
        <View className={`px-3 py-1 rounded-full border bg-orange-500/15 border-orange-500/40 ${previewMode ? 'mt-2' : 'mt-4'}`}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            className="font-semibold text-xs tracking-widest text-orange-400"
          >
            GLIDEBOARD PRO
          </Text>
        </View>
      </View>

      {/* Headline */}
      <Text className={`text-white font-bold text-center ${previewMode ? 'text-3xl mt-3' : 'text-4xl mt-5'}`}>
        Full Access
      </Text>
      <Text className={`text-gray-400 text-center leading-5 ${previewMode ? 'text-sm mt-1.5' : 'text-base mt-2'}`}>
        Everything unlocked. Choose the plan that fits — renews automatically, cancel anytime.
      </Text>

      {/* Current access status. A paid subscriber sees the "active" card and no
          buy option. */}
      {hasPaidSubscription && (
        <View className="mt-6 bg-green-500/10 border border-green-500/40 rounded-2xl p-5 items-center">
          <Check size={32} color="#22c55e" />
          <Text className="text-green-400 font-bold text-lg mt-2">
            Your subscription is active
          </Text>
          <Text className="text-gray-400 text-sm mt-1 text-center">
            Renews automatically each year · manage it in your {STORE_SETTINGS}
          </Text>
        </View>
      )}

      {/* Benefits */}
      {showSales && (
        <View className={previewMode ? 'mt-4' : 'mt-7'}>
          {MEMBERSHIP_BENEFITS.map((b) => (
            <View key={b} className={`flex-row items-center ${previewMode ? 'mb-2' : 'mb-3'}`}>
              <View className="w-6 h-6 rounded-full items-center justify-center mr-3 bg-orange-500/20">
                <Check size={15} color="#f97316" />
              </View>
              <Text className="text-gray-200 text-base flex-1">{b}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Plan selector — Annual (best value) + Monthly. Both unlock the same
          full access; only the billing cadence and price differ. */}
      {showSales && (
        <View className={previewMode ? 'mt-4' : 'mt-5'}>
          {/* Annual */}
          <Pressable
            onPress={() => setSelectedPlan('annual')}
            className={`rounded-2xl border ${previewMode ? 'p-3.5' : 'p-4'} flex-row items-center ${
              selectedPlan === 'annual' ? 'border-orange-500 bg-orange-500/10' : 'border-gray-800 bg-gray-900'
            }`}
          >
            <View
              className={`w-6 h-6 rounded-full border-2 items-center justify-center mr-3 ${
                selectedPlan === 'annual' ? 'border-orange-500 bg-orange-500' : 'border-gray-600'
              }`}
            >
              {selectedPlan === 'annual' && <Check size={14} color="#fff" />}
            </View>
            <View className="flex-1">
              <View className="flex-row items-center">
                <Text className="text-white font-bold text-base">Annual</Text>
                <View className="ml-2 bg-orange-500 px-2 py-0.5 rounded-full">
                  <Text className="text-black font-bold text-[10px] tracking-wide">BEST VALUE</Text>
                </View>
              </View>
              <Text className="text-gray-400 text-xs mt-0.5">Billed yearly · renews automatically</Text>
            </View>
            <View className="items-end ml-2">
              <Text className="text-white font-bold text-lg">{ANNUAL_PRICE}</Text>
              <Text className="text-gray-500 text-xs">/ year</Text>
            </View>
          </Pressable>

          {/* Monthly */}
          <Pressable
            onPress={() => setSelectedPlan('monthly')}
            className={`rounded-2xl border mt-3 ${previewMode ? 'p-3.5' : 'p-4'} flex-row items-center ${
              selectedPlan === 'monthly' ? 'border-orange-500 bg-orange-500/10' : 'border-gray-800 bg-gray-900'
            }`}
          >
            <View
              className={`w-6 h-6 rounded-full border-2 items-center justify-center mr-3 ${
                selectedPlan === 'monthly' ? 'border-orange-500 bg-orange-500' : 'border-gray-600'
              }`}
            >
              {selectedPlan === 'monthly' && <Check size={14} color="#fff" />}
            </View>
            <View className="flex-1">
              <Text className="text-white font-bold text-base">Monthly</Text>
              <Text className="text-gray-400 text-xs mt-0.5">Billed monthly · renews automatically</Text>
            </View>
            <View className="items-end ml-2">
              <Text className="text-white font-bold text-lg">{MONTHLY_PRICE}</Text>
              <Text className="text-gray-500 text-xs">/ month</Text>
            </View>
          </Pressable>
        </View>
      )}

      {/* Primary action */}
      {showSales && (
        <Pressable
          onPress={handleSubscribe}
          disabled={busy}
          className={`py-4 rounded-2xl items-center ${previewMode ? 'mt-3' : 'mt-5'} ${
            busy ? 'bg-orange-500/50' : 'bg-orange-500 active:opacity-80'
          }`}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text numberOfLines={1} adjustsFontSizeToFit className="text-white font-bold text-lg">
              Start Subscription
            </Text>
          )}
        </Pressable>
      )}

      {/* Restore — ALWAYS available (only hidden in the compact screenshot
          preview). Apple requires a Restore Purchases action to be reachable at
          all times, regardless of current access state. */}
      {!previewMode && (
        <Pressable onPress={handleRestore} disabled={busy} className="mt-4 flex-row items-center justify-center py-2">
          {restore.isPending ? (
            <ActivityIndicator color="#9ca3af" />
          ) : (
            <>
              <RefreshCw size={15} color="#9ca3af" />
              <Text className="text-gray-400 text-base ml-2">Restore purchase</Text>
            </>
          )}
        </Pressable>
      )}

      {/* Preview-mode note (hidden in the compact screenshot preview) */}
      {!isStoreConfigured && showSales && !previewMode && (
        <View className="mt-4 bg-blue-500/10 border border-blue-500/30 rounded-xl p-3">
          <Text className="text-blue-300 text-xs text-center leading-4">
            Preview mode: this is a simulated purchase so you can test the flow. In the published app this charges
            through {STORE_NAME}.
          </Text>
        </View>
      )}

      {/* Fine print (hidden in the compact screenshot preview to keep everything on one screen) */}
      {showSales && !previewMode && (
        <Text className="text-gray-600 text-xs text-center mt-5 leading-4">
          {selectedPlan === 'monthly'
            ? `This is an auto-renewing monthly subscription (${MONTHLY_PRICE}/month). It renews automatically each month unless you cancel at least 24 hours before it ends.`
            : `This is an auto-renewing annual subscription (${ANNUAL_PRICE}/year). It renews automatically each year unless you cancel at least 24 hours before it ends.`}
          {' '}Manage or cancel anytime in your {STORE_SETTINGS}. Payment is charged to your {STORE_ACCOUNT} at confirmation.
        </Text>
      )}

      {/* Privacy Policy + Terms of Use — required by Apple (3.1.2) and by Google
          Play's subscription rules on any screen that offers a subscription.
          Both must be functional links. */}
      {!previewMode && (
        <View className="flex-row items-center justify-center mt-3">
          <Pressable onPress={() => router.push('/privacy-policy')} hitSlop={8} className="px-2 py-1">
            <Text className="text-gray-500 text-xs underline">Privacy Policy</Text>
          </Pressable>
          <Text className="text-gray-700 text-xs">·</Text>
          <Pressable
            onPress={() => Linking.openURL(TERMS_URL)}
            hitSlop={8}
            className="px-2 py-1"
          >
            <Text className="text-gray-500 text-xs underline">Terms of Use</Text>
          </Pressable>
        </View>
      )}
    </>
  );

  // Preview: full-screen, no scroll, scaled to fit so the whole paywall lands in
  // one screenshot on any device size.
  if (previewMode) {
    return (
      <View className="flex-1 bg-black">
        <View
          style={{
            flex: 1,
            paddingTop: insets.top + 8,
            paddingBottom: insets.bottom + 12,
            paddingHorizontal: 20,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onLayout={(e) => setAvailH(e.nativeEvent.layout.height)}
        >
          {/* Measure natural height, then scale uniformly to fit. The scale is
              applied about the center, so the block stays centered and fully
              on-screen. maxWidth keeps the layout from sprawling on wide frames. */}
          <View
            onLayout={(e) => setContentH(e.nativeEvent.layout.height)}
            style={{ width: '100%', maxWidth: 400, transform: [{ scale: fitScale }] }}
          >
            {body}
          </View>
        </View>
        {/* Close — absolute so it never affects the fitted layout */}
        <Pressable
          onPress={dismiss}
          className="absolute right-3 p-2"
          style={{ top: insets.top + 4 }}
          hitSlop={12}
        >
          <X size={26} color="#9ca3af" />
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Close */}
        <Pressable onPress={dismiss} className="self-end p-2 -mr-2" hitSlop={12}>
          <X size={26} color="#9ca3af" />
        </Pressable>

        {/* DEV BUILDS ONLY — jump to the screenshot preview, which renders the
            full sales paywall (both plans, prices, benefits) as a brand-new
            customer would see it, ignoring the fact that this device already
            has a test subscription. `__DEV__` is false in any release build, so
            customers never see this. */}
        {__DEV__ && (
          <Pressable
            onPress={() => router.replace({ pathname: '/unlock', params: { preview: '1' } })}
            className="mb-3 bg-orange-500/15 border border-orange-500/40 rounded-xl px-4 py-3 active:opacity-80"
          >
            <Text className="text-orange-300 text-sm font-semibold text-center">
              Open screenshot preview →
            </Text>
            <Text className="text-gray-500 text-xs text-center mt-0.5">
              Dev only · shows the full sales paywall for App Store screenshots
            </Text>
          </Pressable>
        )}
        {body}
      </ScrollView>
    </View>
  );
}
