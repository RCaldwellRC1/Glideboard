/**
 * Dynamic Expo config.
 *
 * Expo prefers app.config.js over app.json and passes the app.json values in as
 * `config`, so everything in app.json still applies — this file only layers on
 * the two things the Android release build needs, without editing app.json.
 */
module.exports = ({ config }) => ({
  ...config,

  // Injects the release signingConfig into the prebuild-generated build.gradle.
  plugins: [...(config.plugins ?? []), './plugins/withAndroidReleaseSigning'],

  android: {
    ...config.android,
    // app.json defines no android.versionCode, so prebuild would emit 1 on every
    // build and Play rejects a version code it has already seen. Codemagic sets
    // BUILD_NUMBER and increments it per build; local builds fall back to 1.
    // Guard against an empty/garbage value, which would yield 0 or NaN — Play
    // requires a positive integer.
    versionCode: Number.parseInt(process.env.BUILD_NUMBER, 10) > 0
      ? Number.parseInt(process.env.BUILD_NUMBER, 10)
      : 1,
  },
});
