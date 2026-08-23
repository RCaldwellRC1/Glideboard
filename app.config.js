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
    // Priority: Math.max(CI environment variable, app.json, default 1)
    // Ensures version code only ever goes UP even if CI build number resets.
    versionCode: (() => {
      const buildNum = Number.parseInt(process.env.BUILD_NUMBER, 10) || 0;
      const jsonVersion = config.android?.versionCode || 0;
      const finalVersion = Math.max(buildNum, jsonVersion, 267);
      console.log(`[BUILD] Build Number: ${buildNum}, JSON Version: ${jsonVersion}, Final Version: ${finalVersion}`);
      return finalVersion;
    })(),
  },
});
