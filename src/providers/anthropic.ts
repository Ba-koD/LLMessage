import { AIProvider, GenerateResult } from './base';

export class AnthropicProvider implements AIProvider {
  readonly name = 'Anthropic';
  private static readonly DEFAULT_MODEL = 'claude-sonnet-4-20250514';

  constructor(private readonly apiKey: string) {}

  async generateMessage(prompt: string, model?: string, signal?: AbortSignal): Promise<GenerateResult> {
    const useModel = model || AnthropicProvider.DEFAULT_MODEL;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: useModel,
        max_tokens: 300,
        messages: [
          { role: 'user', content: prompt },
        ],
      }),
      signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${error}`);
    }

    const data = (await response.json()) as {
      model: string;
      content: Array<{ type: string; text: string }>;
    };

    const textBlock = data.content.find((b) => b.type === 'text');
    return {
      message: textBlock?.text?.trim() ?? '',
      model: data.model || useModel,
    };
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }
}
