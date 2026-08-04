import { remoteLog } from '@/lib/remoteLog';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_VIBECODE_GOOGLE_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

/**
 * The "Brain" of the AI Coach.
 * Switched to Google Gemini 1.5 Flash to provide high-quality coaching
 * while staying within the generous free-tier limits.
 */
export async function askCoach(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY || GEMINI_API_KEY.includes('n0tr3al')) {
    console.warn('[BRAIN] No real Google API key found');
    return "I'm currently in training mode. Please add a Google API key to my settings to unlock my full potential!";
  }

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500,
        }
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('[BRAIN] Gemini API Error:', response.status, errorData);
      return "I'm having trouble thinking clearly right now. Let's try again in a moment!";
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('Empty response from Gemini');
    }

    return text.trim();
  } catch (error) {
    console.error('[BRAIN] Thinking Error:', error);
    remoteLog('ai_brain_error', { message: String(error) });
    return "Something interrupted my thoughts. Let's get back to the workout!";
  }
}
