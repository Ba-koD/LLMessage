import { AIProvider, ChatMessage, GenerateResult } from './base';

/**
 * Custom provider for any OpenAI-compatible API endpoint.
 */
export class CustomProvider implements AIProvider {
  readonly name = 'Custom';

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly defaultModel: string,
  ) {}

  async generateMessage(prompt: string, model?: string, signal?: AbortSignal): Promise<GenerateResult> {
    const useModel = model || this.defaultModel;
    const messages: ChatMessage[] = [
      { role: 'user', content: prompt },
    ];

    const url = `${this.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const body: Record<string, unknown> = {
      messages,
      temperature: 0.4,
      max_tokens: 300,
    };
    if (useModel) {
      body.model = useModel;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Custom API error (${response.status}): ${error}`);
    }

    const data = (await response.json()) as {
      model?: string;
      choices: Array<{ message: { content: string } }>;
    };

    return {
      message: data.choices[0]?.message?.content?.trim() ?? '',
      model: data.model || useModel || 'unknown',
    };
  }

  async isAvailable(): Promise<boolean> {
    return !!this.baseUrl;
  }
}
