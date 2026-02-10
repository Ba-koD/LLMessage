import { AIProvider, ChatMessage, GenerateResult } from './base';

export class LocalProvider implements AIProvider {
  readonly name = 'Local';
  private static readonly DEFAULT_MODEL = 'llama3.2';

  constructor(private readonly baseUrl: string) {}

  async generateMessage(prompt: string, model?: string, signal?: AbortSignal): Promise<GenerateResult> {
    const useModel = model || LocalProvider.DEFAULT_MODEL;
    const messages: ChatMessage[] = [
      { role: 'user', content: prompt },
    ];

    const url = `${this.baseUrl.replace(/\/+$/, '')}/api/chat`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: useModel,
        messages,
        stream: false,
      }),
      signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Local API error (${response.status}): ${error}`);
    }

    const data = (await response.json()) as {
      model: string;
      message: { content: string };
    };

    return {
      message: data.message?.content?.trim() ?? '',
      model: data.model || useModel,
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const url = `${this.baseUrl.replace(/\/+$/, '')}/api/tags`;
      const response = await fetch(url, { method: 'GET' });
      return response.ok;
    } catch {
      return false;
    }
  }
}
