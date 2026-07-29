import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, NativeModules } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { remoteLog } from './remoteLog';

// Pull the useful fields off a RevenueCat/StoreKit error so we can see the real
// cause in the LOGS tab (the friendly alert alone doesn't reveal the code).
function describeError(e: any): Record<string, unknown> {
  return {
    message: e?.message ?? String(e),
    name: e?.name ?? null,
    // First few stack frames — pinpoints whether the throw came from the JS
    // wrapper or the native bridge call inside configure().
    stack: typeof e?.stack === 'string' ? e.stack.split('\n').slice(0, 3).join(' | ') : null,
    code: e?.code ?? e?.userInfo?.code ?? null,
    underlying: e?.underlyingErrorMessage ?? e?.userInfo?.readableErrorCode ?? null,
    userCancelled: !!e?.userCancelled,
  };
}

// Records why the last getPurchases() call returned null, so the paywall can
// show a message that distinguishes "payments engine never started" (a build
// problem) from a genuine, transient store outage.
type RcFailure = 'module_missing' | 'configure_failed' | null;
let lastRcFailure: RcFailure = null;

// ---------------------------------------------------------------------------
// Membership — subscription + entitlement layer
//
// The app is free to download. Full access is granted by an AUTO-RENEWING
// subscription, offered as two plans that unlock the exact same access:
//   • Monthly — $1.20 / month
//   • Annual  — $12.99 / year (best value)
// Both renew automatically through the App Store until the user cancels. There
// is no lifetime / one-time option.
//
// Real purchases run through RevenueCat (react-native-purchases) once the App
// Store product + API key are configured. Until then — e.g. inside the Vibecode
// preview — there is no key, so we run a clearly-labeled SIMULATED purchase so
// the whole flow can be seen and tested.
// ---------------------------------------------------------------------------

// RevenueCat public SDK key. Vibecode injects these automatically once the
// Payments tab is configured:
//   EXPO_PUBLIC_VIBECODE_REVENUECAT_TEST_KEY    — dev/preview (RevenueCat Test Store)
//   EXPO_PUBLIC_VIBECODE_REVENUECAT_APPLE_KEY   — production iOS (App Store)
//   EXPO_PUBLIC_VIBECODE_REVENUECAT_GOOGLE_KEY  — production Android (Play Store)
// The public key is per-app: the production Apple key MUST belong to the App
// Store app in this RevenueCat project, or offerings won't resolve on device.
// EXPO_PUBLIC_REVENUECAT_IOS_KEY is kept only as a legacy fallback.
const TEST_STORE_KEY = process.env.EXPO_PUBLIC_VIBECODE_REVENUECAT_TEST_KEY;

// The production key for the current platform. Android and iOS have separate
// public keys and they are NOT interchangeable — never fall back across stores.
const PRODUCTION_KEY =
  Platform.OS === 'android'
    ? process.env.EXPO_PUBLIC_VIBECODE_REVENUECAT_GOOGLE_KEY
    : (process.env.EXPO_PUBLIC_VIBECODE_REVENUECAT_APPLE_KEY ??
       process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY);

// RevenueCat Test Store keys are prefixed `test_`. They simulate purchases, earn
// no revenue, and get an app rejected in review — so they must never reach a
// release build, no matter how the environment is configured.
const isTestStoreKey = (key: string | undefined): boolean =>
  typeof key === 'string' && key.startsWith('test_');

const RESOLVED_KEY = __DEV__ ? (TEST_STORE_KEY ?? PRODUCTION_KEY) : PRODUCTION_KEY;

// Hard guard: in a release build, a Test Store key is treated as no key at all.
// That drops the app into the clearly-labeled simulated-purchase path instead of
// silently shipping fake purchases as if they were real.
const KEY_REJECTED_AS_TEST = !__DEV__ && isTestStoreKey(RESOLVED_KEY);
const RC_API_KEY = KEY_REJECTED_AS_TEST ? undefined : RESOLVED_KEY;

// The RevenueCat entitlement identifier that represents full access via the
// auto-renewing subscription. This MUST exactly match the entitlement's
// identifier in the RevenueCat dashboard (Project → Entitlements). For this
// project that identifier is "Glideboard Pro" — NOT "pro". If it doesn't match,
// a successful purchase will fail our own verification and never unlock access.
// Override via the Vibecode ENV tab (EXPO_PUBLIC_REVENUECAT_ENTITLEMENT) only if
// you rename it in RevenueCat.
const SUBSCRIPTION_ENTITLEMENT =
  (process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT ?? 'Glideboard Pro').trim();

// The two subscription plans offered on the paywall. Both grant the same full
// access via the `Glideboard Pro` entitlement — they differ only in billing
// cadence and price.
export type PlanId = 'monthly' | 'annual';

// Display prices shown on the paywall. In the live app the real localized price
// comes from RevenueCat; these are the fallback/preview prices and must match
// what's configured in App Store Connect.
// Apple has no $1.20 price point, so the monthly plan is configured at its
// nearest tier, $1.19. (The real localized price still comes from the store at
// runtime; this is only the preview/fallback.)
export const MONTHLY_PRICE = process.env.EXPO_PUBLIC_MONTHLY_PRICE ?? '$1.19';
export const ANNUAL_PRICE = process.env.EXPO_PUBLIC_SUBSCRIPTION_PRICE ?? '$12.99';

// Backwards-compatible alias — some screens still reference the single headline
// price. It points at the annual (best-value) plan.
export const SUBSCRIPTION_PRICE = ANNUAL_PRICE;

// Human-readable billing term shown on the paywall.
export const SUBSCRIPTION_TERM_LABEL = 'per year';

// True only when the real store is configured. In the preview this is false and
// purchases are simulated.
export const isStoreConfigured = !!RC_API_KEY;

const LOCAL_KEY = 'membership-access';

export interface UnlockState {
  // hasFullAccess is the single gate for the whole app: true when the user has
  // an active auto-renewing subscription.
  hasFullAccess: boolean;
  subscriptionActive: boolean; // active auto-renewing subscription
  simulated: boolean;
}

const DEFAULT_STATE: UnlockState = {
  hasFullAccess: false,
  subscriptionActive: false,
  simulated: !isStoreConfigured,
};

// --- Local persistence (preview only) ----------------------------------------

interface LocalRecord {
  // Simulated subscription flag — only used in preview mode (no real store). In
  // the live app the active subscription is read from RevenueCat, not from here.
  subscriptionActive?: boolean;
}

async function readLocal(): Promise<LocalRecord> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {};
}

async function writeLocal(record: LocalRecord): Promise<void> {
  try {
    await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(record));
  } catch {
    // ignore
  }
}

// --- RevenueCat (lazy, guarded so the preview never crashes) -----------------

let rcConfigured = false;

async function getPurchases(): Promise<any | null> {
  if (!isStoreConfigured) {
    // Surface the specific, shippable-bug case: a release build that only has a
    // Test Store key. Without this the app would look like an ordinary
    // "store not configured yet" preview and the misconfiguration could ship.
    if (KEY_REJECTED_AS_TEST) {
      remoteLog('rc_test_key_rejected_in_release', {
        platform: Platform.OS,
        reason:
          Platform.OS === 'android'
            ? 'EXPO_PUBLIC_VIBECODE_REVENUECAT_GOOGLE_KEY is missing — only a test_ key was available'
            : 'EXPO_PUBLIC_VIBECODE_REVENUECAT_APPLE_KEY is missing — only a test_ key was available',
      });
    }
    return null;
  }

  // Definitive check: is the native RevenueCat module actually compiled into
  // THIS binary? react-native-purchases is a native module — if the build
  // didn't include it (e.g. a build produced without autolinking the pod),
  // NativeModules.RNPurchases is undefined and every call into the JS wrapper
  // will throw "Object is not a function". Detecting it here lets us log the
  // real cause (native missing) instead of a vague configure() failure.
  if (!NativeModules.RNPurchases) {
    lastRcFailure = 'module_missing';
    remoteLog('rc_module_unavailable', {
      reason: 'NativeModules.RNPurchases is undefined — payments SDK not in build',
      platform: Platform.OS,
    });
    return null;
  }

  // Probe the native module BEFORE configuring. The recurring
  // "Object is not a function" comes from inside configure(), which calls
  // RNPurchases.setupPurchases(...). If the native module is present but that
  // method is missing/not-a-function, it's a JS↔native version mismatch — this
  // log makes that unambiguous in the LOGS tab instead of a vague failure.
  const nativeRc: any = NativeModules.RNPurchases;
  remoteLog('rc_native_probe', {
    platform: Platform.OS,
    nativeType: typeof nativeRc,
    hasSetupPurchases: typeof nativeRc?.setupPurchases,
    methodSample: (() => {
      try {
        return Object.keys(nativeRc ?? {}).slice(0, 10);
      } catch {
        return [];
      }
    })(),
  });

  try {
    // Load the SDK with a synchronous require, NOT `await import()`. Dynamic
    // import() is miscompiled by this project's Metro/Hermes lazy-bundling
    // pipeline (see the "fix-dynamic-imports" metro config) and throws
    // "Object is not a function" from inside the lazy-import machinery before
    // configure() is ever reached. require() sidesteps that entirely, and it's
    // safe because we've already confirmed NativeModules.RNPurchases exists.
    const mod: any = require('react-native-purchases');
    // Resolve the Purchases object robustly across module-interop shapes: the
    // default export is the class, but guard against double-wrapped interop.
    const Purchases =
      mod?.default && typeof mod.default.configure === 'function'
        ? mod.default
        : typeof mod?.configure === 'function'
          ? mod
          : mod?.default?.default;

    // If the native RevenueCat module isn't present (e.g. the Vibecode preview,
    // or a build where it wasn't linked), configure won't exist. Log that
    // distinctly so we can tell it apart from a runtime configure() failure.
    if (!Purchases || typeof Purchases.configure !== 'function') {
      lastRcFailure = 'configure_failed';
      remoteLog('rc_module_unavailable', {
        modType: typeof mod,
        defaultType: typeof mod?.default,
        hasConfigure: typeof Purchases?.configure,
      });
      return null;
    }

    if (!rcConfigured) {
      Purchases.configure({ apiKey: RC_API_KEY! });
      rcConfigured = true;
      remoteLog('rc_configured', {
        keyPrefix: (RC_API_KEY ?? '').slice(0, 5),
        platform: Platform.OS,
        isDev: __DEV__,
      });

      // Route RevenueCat's own internal logging through console.log — never
      // console.error. The SDK logs benign events (most notably a user
      // cancelling the Apple purchase sheet) at error level, and React Native's
      // ExceptionsManager turns any console.error into a full-screen red error
      // overlay. This keeps those informational messages out of the error path.
      if (typeof Purchases.setLogHandler === 'function') {
        try {
          Purchases.setLogHandler((_level: unknown, message: string) => {
            console.log(`[RevenueCat] ${message}`);
          });
        } catch {
          // ignore — logging preference is best-effort
        }
      }
    }
    lastRcFailure = null;
    return Purchases;
  } catch (e) {
    lastRcFailure = 'configure_failed';
    remoteLog('rc_configure_error', describeError(e));
    return null;
  }
}

// Whether the user currently has an active subscription. Returns false until
// the subscription product is configured in RevenueCat (entitlement
// `Glideboard Pro`).
async function getActiveSubscription(): Promise<boolean> {
  const Purchases = await getPurchases();
  if (!Purchases) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return !!info?.entitlements?.active?.[SUBSCRIPTION_ENTITLEMENT];
  } catch {
    return false;
  }
}

// --- Public API --------------------------------------------------------------

export async function getUnlockState(): Promise<UnlockState> {
  const local = await readLocal();

  // Subscription status. When the real store is configured (production /
  // TestFlight), the App Store — via RevenueCat's verified entitlement — is the
  // ONLY source of truth. We must NEVER grant a subscription from a locally
  // cached flag, or the app could unlock without a confirmed Apple payment.
  // The local flag is used solely in the preview (no store configured) so the
  // purchase flow can be demonstrated without charging anyone.
  const storeSubscription = await getActiveSubscription();
  // Production (a real App Store build, __DEV__ === false) is gated STRICTLY by
  // the verified Apple entitlement — a locally cached flag is never trusted, so
  // the app can't unlock without a confirmed payment.
  //
  // The Vibecode preview / RevenueCat Test Store (__DEV__ === true) is different:
  // Test Store purchases are simulated and RESET on every app restart, so
  // getCustomerInfo() reports no entitlement after a reload and the tester gets
  // locked out — unable to even start a workout — until they re-subscribe. To
  // make testing usable, honor the locally cached flag here too, so a test
  // purchase persists across restarts. This branch never runs in a release build.
  const subscriptionActive = isStoreConfigured && !__DEV__
    ? storeSubscription
    : storeSubscription || !!local.subscriptionActive;

  return {
    ...DEFAULT_STATE,
    hasFullAccess: subscriptionActive,
    subscriptionActive,
  };
}

// Run the actual subscription purchase. In a real store build access is granted
// ONLY after Apple returns a verified, active entitlement — never before, and
// never on a cancelled or failed purchase.
// Returns { purchased: true } only when Apple confirmed a verified, active
// subscription. A user cancellation resolves with { purchased: false } (no
// error), so the caller can quietly do nothing instead of showing a failure.
export async function purchaseSubscription(plan: PlanId = 'annual'): Promise<{ purchased: boolean }> {
  // --- Real store path (production / TestFlight) ---
  if (isStoreConfigured) {
    const Purchases = await getPurchases();
    // If the store SDK can't be reached, we must NOT silently unlock. Fail so
    // the user can retry — access stays locked until Apple confirms payment.
    // Distinguish a payments-engine startup failure (a build-level problem that
    // retrying won't fix) from a genuine transient store outage.
    if (!Purchases) {
      remoteLog('rc_purchase_blocked', { reason: lastRcFailure });
      if (lastRcFailure === 'configure_failed' || lastRcFailure === 'module_missing') {
        throw new Error(
          'Payments aren’t available in this version of the app yet. An update is needed before you can subscribe.',
        );
      }
      throw new Error('The App Store is unavailable right now. Please try again in a moment.');
    }

    let offerings: any;
    try {
      offerings = await Purchases.getOfferings();
    } catch (e) {
      remoteLog('rc_offerings_error', describeError(e));
      throw new Error('Could not reach the App Store to load the subscription. Please try again.');
    }

    // Log exactly what RevenueCat resolved so we can diagnose "no package" /
    // misconfigured-offering issues from the LOGS tab.
    remoteLog('rc_offerings', {
      requestedPlan: plan,
      current: offerings?.current?.identifier ?? null,
      hasMonthly: !!offerings?.current?.monthly,
      hasAnnual: !!offerings?.current?.annual,
      pkgCount: offerings?.current?.availablePackages?.length ?? 0,
      allOfferings: Object.keys(offerings?.all ?? {}),
    });

    // Pick the package for the plan the user chose. Fall back to the other
    // plan, then the first available package, so a purchase can still complete
    // if one plan is momentarily missing from the offering.
    const preferred =
      plan === 'monthly' ? offerings.current?.monthly : offerings.current?.annual;
    const fallback =
      plan === 'monthly' ? offerings.current?.annual : offerings.current?.monthly;
    const pkg = preferred ?? fallback ?? offerings.current?.availablePackages?.[0];
    if (!pkg) {
      throw new Error('No subscription is configured in the store yet.');
    }

    // purchasePackage REJECTS if the user cancels or the purchase fails, so the
    // verification below is only reached after Apple reports a completed
    // transaction. Access is granted solely by the verified entitlement.
    let customerInfo: any;
    try {
      ({ customerInfo } = await Purchases.purchasePackage(pkg));
    } catch (e: any) {
      // A user tapping "Cancel" on the Apple purchase sheet is normal, not a
      // failure. Swallow it quietly so no error alert is shown — access simply
      // stays locked and they can try again whenever they like.
      if (e?.userCancelled) {
        remoteLog('rc_purchase_cancelled', {});
        return { purchased: false };
      }
      remoteLog('rc_purchase_error', describeError(e));
      throw e;
    }

    const activeKeys = Object.keys(customerInfo?.entitlements?.active ?? {});
    remoteLog('rc_purchase_result', { activeEntitlements: activeKeys, expected: SUBSCRIPTION_ENTITLEMENT });

    if (!customerInfo?.entitlements?.active?.[SUBSCRIPTION_ENTITLEMENT]) {
      throw new Error('Your purchase could not be verified. You have not been charged.');
    }
    // In the preview / Test Store (__DEV__), also cache access locally so it
    // survives the app restart that would otherwise wipe the simulated Test
    // Store purchase and lock the tester out. No effect in a release build,
    // where access is always re-verified against the real Apple entitlement.
    if (__DEV__) {
      const local = await readLocal();
      await writeLocal({ ...local, subscriptionActive: true });
    }
    return { purchased: true };
  }

  // --- Simulated path (preview ONLY — no real store configured) ---
  // Reached only in the Vibecode preview, never in a store build, so it can
  // never grant paid access without a real Apple payment.
  await new Promise((r) => setTimeout(r, 900));
  const local = await readLocal();
  await writeLocal({ ...local, subscriptionActive: true });
  return { purchased: true };
}

// Restore a previous subscription on a new device / reinstall.
export async function restoreSubscription(): Promise<{ restored: boolean }> {
  // --- Real store path (production / TestFlight) ---
  if (isStoreConfigured) {
    const Purchases = await getPurchases();
    if (!Purchases) {
      throw new Error('The App Store is unavailable right now. Please try again in a moment.');
    }
    const customerInfo = await Purchases.restorePurchases();
    // Only a verified, active App Store entitlement restores access. A cached
    // local flag is never trusted here.
    const active = !!customerInfo?.entitlements?.active?.[SUBSCRIPTION_ENTITLEMENT];
    return { restored: active };
  }

  // --- Simulated restore (preview ONLY) ---
  const local = await readLocal();
  return { restored: !!local.subscriptionActive };
}

// --- React Query hooks -------------------------------------------------------

const UNLOCK_KEY = ['unlock-state'];

export function useUnlockState() {
  return useQuery({
    queryKey: UNLOCK_KEY,
    queryFn: getUnlockState,
    staleTime: 30_000,
  });
}

// Single source of truth for gating the app. true = active subscriber. Use this
// anywhere you need to lock/unlock content.
export function useHasFullAccess(): { hasFullAccess: boolean; isLoading: boolean } {
  const { data, isLoading } = useUnlockState();
  return { hasFullAccess: data?.hasFullAccess ?? false, isLoading };
}

export function usePurchaseSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (plan: PlanId = 'annual') => purchaseSubscription(plan),
    onSuccess: () => qc.invalidateQueries({ queryKey: UNLOCK_KEY }),
  });
}

export function useRestoreSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => restoreSubscription(),
    onSuccess: () => qc.invalidateQueries({ queryKey: UNLOCK_KEY }),
  });
}
