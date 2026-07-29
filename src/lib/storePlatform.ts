import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Store-specific wording.
//
// Subscriptions are billed by whichever store the app was installed from, so
// every user-facing mention of billing, cancellation, or the store itself has to
// match the platform. Telling an Android user to "cancel in your App Store
// settings" is simply wrong — there is no App Store on their phone — and Google
// Play's subscription rules require the cancellation path to be described
// accurately. These constants keep that copy in one place.
// ---------------------------------------------------------------------------

const isAndroid = Platform.OS === 'android';

/** The storefront the app is distributed through: "App Store" / "Google Play". */
export const STORE_NAME = isAndroid ? 'Google Play' : 'App Store';

/** The company that processes the payment: "Apple" / "Google". */
export const STORE_COMPANY = isAndroid ? 'Google' : 'Apple';

/** Where the user goes to manage or cancel — reads naturally mid-sentence. */
export const STORE_SETTINGS = isAndroid
  ? 'Google Play subscription settings'
  : 'App Store settings';

/** The account the charge lands on: "Apple ID" / "Google account". */
export const STORE_ACCOUNT = isAndroid ? 'Google account' : 'Apple ID';

/** Full storefront name, for prose like "available on the …". */
export const STORE_FULL_NAME = isAndroid ? 'Google Play Store' : 'Apple App Store';

/** The generic device word, for tips that reference the phone's own settings. */
export const DEVICE_NAME = isAndroid ? 'phone' : 'iPhone';

/**
 * Subscription terms the store requires us to link from any screen that sells a
 * subscription. Apple accepts our own terms in place of its standard EULA and
 * Google has no equivalent document, so one self-hosted, platform-neutral page
 * serves both stores — and the same URL can be pasted into App Store Connect
 * and the Google Play Console.
 *
 * Note the /api/ prefix: on the published host only /api/... paths reach the
 * backend, so the bare /terms URL lands on a blank placeholder page instead of
 * this document. Do not "tidy" it out.
 */
export const TERMS_URL = 'https://heaped-twig.vibecode.run/api/terms';

/** Public Privacy Policy — the same URL works for both stores' listing fields. */
export const PRIVACY_URL = 'https://heaped-twig.vibecode.run/api/privacy';

/** Public Support page, for the stores' support-URL fields. */
export const SUPPORT_URL = 'https://heaped-twig.vibecode.run/api/support';
