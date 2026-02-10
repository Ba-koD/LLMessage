import { AIProvider, ChatMessage, GenerateResult } from './base';

export class OpenAIProvider implements AIProvider {
  readonly name = 'OpenAI';
  private static readonly DEFAULT_MODEL = 'gpt-4o-mini';

  constructor(private readonly apiKey: string) {}

  async generateMessage(prompt: string, model?: string, signal?: AbortSignal): Promise<GenerateResult> {
    const useModel = model || OpenAIProvider.DEFAULT_MODEL;
    const messages: ChatMessage[] = [
      { role: 'user', content: prompt },
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: useModel,
        messages,
        temperature: 0.4,
        max_tokens: 300,
      }),
      signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${error}`);
    }

    const data = (await response.json()) as {
      model: string;
      choices: Array<{ message: { content: string } }>;
    };

    return {
      message: data.choices[0]?.message?.content?.trim() ?? '',
      model: data.model || useModel,
    };
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }
}
