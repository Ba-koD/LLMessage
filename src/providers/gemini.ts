import { AIProvider, GenerateResult } from './base';

export class GeminiProvider implements AIProvider {
  readonly name = 'Google Gemini';
  private static readonly DEFAULT_MODEL = 'gemini-2.5-flash';

  constructor(private readonly apiKey: string) {}

  async generateMessage(prompt: string, model?: string, signal?: AbortSignal): Promise<GenerateResult> {
    const useModel = model || GeminiProvider.DEFAULT_MODEL;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': this.apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 4096,
        },
      }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let msg = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        msg = errorJson?.error?.message ?? errorText;
      } catch {}
      throw new Error(`Gemini API error (${response.status}): ${msg}`);
    }

    const data = (await response.json()) as {
      modelVersion?: string;
      candidates: Array<{
        finishReason?: string;
        content: { parts: Array<{ text: string }> };
      }>;
    };

    const candidate = data.candidates?.[0];
    return {
      message: candidate?.content?.parts?.[0]?.text?.trim() ?? '',
      model: data.modelVersion || useModel,
      truncated: candidate?.finishReason?.toUpperCase() === 'MAX_TOKENS',
    };
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }
}
