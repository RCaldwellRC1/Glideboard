/** @type {import('tailwindcss').Config} */
const plugin = require("tailwindcss/plugin");

module.exports = {
  // NOTE: Update this to include the paths to all of your component files.
  content: ["./App.tsx", "./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  corePlugins: {
    space: false,
  },
  theme: {
    // NOTE to AI: You can extend the theme with custom colors or styles here.
    extend: {
      // For example, you can add a primary or secondary color here.
      // colors: {
      //   primary: "#INSERT_VALID_HEX_CODE",
      //   secondary: "#INSERT_VALID_HEX_CODE",
      // },
      // NOTE to AI: Global type scale. Bumped up from the original (base was 14px)
      // so the app reads comfortably WITHOUT the iOS "Larger Text" accessibility
      // setting enabled. Small/body sizes get the biggest relative bump; large
      // display sizes are nudged only slightly to avoid overflowing fixed layouts.
      // Each size reads a CSS variable supplied at the app root (the "Text Size"
      // setting: Small / Medium / Large). The fallback px is the Medium/default
      // value, so with no var set the app looks exactly as before. Keep these
      // fallbacks in sync with BASE_FONT_SIZES in src/lib/settings/store.ts.
      fontSize: {
        xs: "var(--fs-xs, 12px)", // was 10
        sm: "var(--fs-sm, 14px)", // was 12
        base: "var(--fs-base, 16px)", // was 14  (standard iOS body size)
        lg: "var(--fs-lg, 20px)", // was 18
        xl: "var(--fs-xl, 22px)", // was 20
        "2xl": "var(--fs-2xl, 26px)", // was 24
        "3xl": "var(--fs-3xl, 34px)", // was 32
        "4xl": "var(--fs-4xl, 42px)", // was 40
        "5xl": "var(--fs-5xl, 50px)", // was 48
        "6xl": "var(--fs-6xl, 58px)", // was 56
        "7xl": "var(--fs-7xl, 66px)", // was 64
        "8xl": "var(--fs-8xl, 74px)", // was 72
        "9xl": "var(--fs-9xl, 82px)", // was 80
      },
    },
  },
  darkMode: "class",
  plugins: [
    plugin(({ matchUtilities, theme }) => {
      const spacing = theme("spacing");

      // space-{n}  ->  gap: {n}
      matchUtilities(
        { space: (value) => ({ gap: value }) },
        { values: spacing, type: ["length", "number", "percentage"] }
      );

      // space-x-{n}  ->  column-gap: {n}
      matchUtilities(
        { "space-x": (value) => ({ columnGap: value }) },
        { values: spacing, type: ["length", "number", "percentage"] }
      );

      // space-y-{n}  ->  row-gap: {n}
      matchUtilities(
        { "space-y": (value) => ({ rowGap: value }) },
        { values: spacing, type: ["length", "number", "percentage"] }
      );
    }),
  ],
};

