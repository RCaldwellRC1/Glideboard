/**
 * Dynamic Expo config.
 *
 * Expo prefers app.config.js over app.json and passes the app.json values in as
 * `config`, so everything in app.json still applies — this file only layers on
 * the two things the Android release build needs, without editing app.json.
 */
module.exports = ({ config }) => ({
  ...config,

  // Injects the release signingConfig ONLY when not building on EAS.
  // EAS handles signing via the credentials we imported earlier.
  plugins: [
    ...(config.plugins ?? []),
    ...(process.env.EAS_BUILD ? [] : ['./plugins/withAndroidReleaseSigning']),
  ],

  android: {
    ...config.android,
    // Priority: CI environment variable > app.json > default (1)
    versionCode: Number.parseInt(process.env.BUILD_NUMBER, 10) > 0
      ? Number.parseInt(process.env.BUILD_NUMBER, 10)
      : (config.android?.versionCode ?? 1),
  },
});
