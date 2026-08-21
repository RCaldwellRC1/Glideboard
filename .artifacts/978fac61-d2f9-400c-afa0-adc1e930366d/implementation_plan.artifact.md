# Implementation Plan: App Stability Recovery

Isolate and resolve the startup crash by simplifying the root layout and removing the new greeting screen temporarily to find the source of the "App has stopped" error.

## User Review Required

> [!CAUTION]
> **Temporary Greeting Removal**: To fix the crash, I am temporarily disabling the "Hi / Let's Do This!" greeting. Once we confirm the app can open to the Tracker safely, I will re-add the greeting using a much safer, non-blocking method.

## Proposed Changes

### Root Layout Stabilization

#### [MODIFY] [_layout.tsx](file:///C:/Users/Rober/AndroidStudioProjects/Glideboard/src/app/_layout.tsx)
1.  **Remove Greeting**: Comment out the `CustomGreeting` component and its logic.
2.  **Safe Fallback**: Return a solid black `<View />` while loading instead of `null` to keep the UI layout tree stable.
3.  **Direct Boot**: Set `SplashScreen.hideAsync()` to trigger as soon as the app is ready, skipping the custom transition.

### Versioning
- Bump to **V1.0.40 (Build 209)**.

## Verification Plan

### Manual Verification
1.  **Cold Boot**: Tap the app icon.
2.  **Verify Splash**: Black screen with logo should appear.
3.  **Verify Entry**: App should transition directly to the **Tracker** screen without crashing.
4.  **Confirmation**: If the app opens successfully, we know the crash was in the greeting/transition logic. If it still crashes, we know the issue is in a library or another component added today.
