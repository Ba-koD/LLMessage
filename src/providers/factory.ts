import { AIProvider } from './base';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { GeminiProvider } from './gemini';
import { LocalProvider } from './local';
import { CustomProvider } from './custom';
import { SecretManager } from '../config/secrets';
import { getConfig, getActiveProfile, migrateProfile } from '../config/settings';

/**
 * Create an AIProvider instance based on the active profile.
 */
export async function createProvider(
  secretManager: SecretManager,
): Promise<{ provider: AIProvider; modelOverride?: string; profileAlias: string }> {
  const raw = getActiveProfile();

  if (!raw) {
    throw new Error('No active profile. Run "LLMessage: Add Profile" first.');
  }

  const profile = migrateProfile(raw);
  const config = getConfig();
  const modelOverride = profile.model || undefined;

  switch (profile.provider) {
    case 'openai': {
      const apiKey = await secretManager.getApiKey(raw.alias);
      if (!apiKey) {
        throw new Error(`API key not found for profile "${raw.alias}". Re-add the profile.`);
      }
      return { provider: new OpenAIProvider(apiKey), modelOverride, profileAlias: raw.alias };
    }

    case 'anthropic': {
      const apiKey = await secretManager.getApiKey(raw.alias);
      if (!apiKey) {
        throw new Error(`API key not found for profile "${raw.alias}". Re-add the profile.`);
      }
      return { provider: new AnthropicProvider(apiKey), modelOverride, profileAlias: raw.alias };
    }

    case 'gemini': {
      const apiKey = await secretManager.getApiKey(raw.alias);
      if (!apiKey) {
        throw new Error(`API key not found for profile "${raw.alias}". Re-add the profile.`);
      }
      return { provider: new GeminiProvider(apiKey), modelOverride, profileAlias: raw.alias };
    }

    case 'local': {
      return {
        provider: new LocalProvider(config.local.url),
        modelOverride,
        profileAlias: raw.alias,
      };
    }

    case 'custom': {
      if (!config.custom.url) {
        throw new Error('Custom endpoint URL not configured. Set "llmessage.custom.url" in settings.');
      }
      const apiKey = (await secretManager.getApiKey(raw.alias)) ?? '';
      return {
        provider: new CustomProvider(apiKey, config.custom.url, config.custom.model),
        modelOverride,
        profileAlias: raw.alias,
      };
    }

    default:
      throw new Error(`Unknown provider: ${profile.provider}`);
  }
}
