/**
 * Result from AI generation, includes the model that was actually used.
 */
export interface GenerateResult {
  message: string;
  model: string;
}

/**
 * Base interface for all AI providers.
 */
export interface AIProvider {
  readonly name: string;

  /**
   * Generate a commit message from the given prompt.
   * @param prompt The full prompt including diff and instructions
   * @param model Optional model override. If empty, provider uses its default.
   * @param signal Optional AbortSignal for timeout / cancellation.
   * @returns The generated message and the model that was actually used
   */
  generateMessage(prompt: string, model?: string, signal?: AbortSignal): Promise<GenerateResult>;

  /**
   * Check if the provider is available / configured correctly.
   */
  isAvailable(): Promise<boolean>;
}

/**
 * Common shape for chat completion messages.
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Standard OpenAI-compatible chat completion request body.
 */
export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
}
