# Implementation Plan: Zero-Cost AI Alternatives (Build #66 - V1.0.25)

The user wants to avoid ongoing costs for OpenAI and Anthropic. This plan provides alternatives using free-tier services or native device features.

## User Review Required

> [!CAUTION]
> **Cost Trade-off**: Switching to "Free" alternatives often means a slight drop in accuracy. Whisper (OpenAI) is the best at hearing numbers through heavy breathing/grunting. Native Android Speech is free but may miss some reps if the gym is noisy.
>
> **Action Required**: To use the "Free" Google option, you will need to generate a real Google API key (which has a very generous free tier) and add it to Codemagic.

## Proposed Options

### Option A: The "Free" Brain (Google Gemini)
Instead of paying Anthropic (Claude) for the AI Coach, we can switch to **Google Gemini 1.5 Flash**.
- **Cost**: $0.00 (within generous free tier limits).
- **Setup**: You provide a Google API Key in Codemagic.
- **Change**: I will update the "Brain" logic to use the Google key.

### Option B: The "Included" Backend Proxy
We can switch the Voice Counter back to your backend (`/api/transcribe`).
- **Cost**: Potentially "Included" if your Vibecode platform plan covers it.
- **Risk**: If your backend doesn't have a shared key, it will return "Unauthorized" again.
- **Recommendation**: Check the "API" tab in your Vibecode Dashboard. If you see OpenAI keys provided by the platform, we should use this.

### Option C: Native Android Voice (Zero Key required)
We can use the tablet's built-in **Android Speech Recognizer**.
- **Cost**: $0.00 (Forever).
- **Pros**: Works offline, no API keys, no monthly fees.
- **Cons**: Less accurate than Whisper; might struggle with short "barking" of numbers during a set.

---

## My Recommendation for this Build (#66)

I will implement **Option B (Revert to Backend Proxy)** first. If you are already paying for the Vibecode platform, they may be covering the AI costs for you.

I will also prepare **Option A (Google Gemini)** as a fallback for the "Brain" features.

### [MODIFY] [useVoiceCounting.ts](file:///C:/Users/Rober/AndroidStudioProjects/Glideboard/src/lib/voice/useVoiceCounting.ts)
- Revert `TRANSCRIBE_URL` to `${BACKEND_URL}/api/transcribe`.
- Remove the direct `Authorization` header so the backend can handle the keys securely.

### [MODIFY] [useVoiceCommands.ts](file:///C:/Users/Rober/AndroidStudioProjects/Glideboard/src/lib/voice/useVoiceCommands.ts)
- Revert to backend proxy.

## Verification Plan

### Manual Verification (On Tablet)
- **Voice Check**: Test barking numbers. If it works, your backend has a key!
- **Error Log**: I will watch the logs for any "401" or "402" errors to confirm if the backend is authorized.
