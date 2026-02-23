import * as vscode from 'vscode';

export type ProviderType = 'openai' | 'anthropic' | 'gemini' | 'local' | 'custom';
export type CommitStyle = 'conventional' | 'conventionalEn' | 'custom';

/** Shape of a saved profile in settings */
export interface Profile {
  provider: ProviderType;
  model: string;
  commitStyle: CommitStyle;
  customPrompt: string;
  locale: string;
}

export function getConfig() {
  const config = vscode.workspace.getConfiguration('llmessage');

  return {
    activeProfile: config.get<string>('activeProfile', ''),
    workspaceProfile: config.get<string>('workspaceProfile', ''),
    profiles: config.get<Record<string, Profile>>('profiles', {}),
    local: {
      url: config.get<string>('local.url', 'http://localhost:11434'),
    },
    custom: {
      url: config.get<string>('custom.url', ''),
      model: config.get<string>('custom.model', ''),
    },
  };
}

/**
 * Get the effective active profile.
 * Workspace-level profile overrides the global active profile.
 */
export function getActiveProfile(): (Profile & { alias: string }) | undefined {
  const config = getConfig();

  // Workspace profile takes priority
  const alias = config.workspaceProfile || config.activeProfile;
  if (!alias || !config.profiles[alias]) {
    return undefined;
  }
  return { alias, ...config.profiles[alias] };
}

/** Migrate old profiles that don't have the new fields */
export function migrateProfile(p: Partial<Profile>): Profile {
  return {
    provider: p.provider ?? 'openai',
    model: p.model ?? '',
    commitStyle: p.commitStyle ?? 'conventional',
    customPrompt: p.customPrompt ?? '',
    locale: p.locale ?? 'en',
  };
}

export function getProviderLabel(provider: ProviderType): string {
  const labels: Record<ProviderType, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    gemini: 'Google Gemini',
    local: 'Local (Ollama, LM Studio, etc.)',
    custom: 'Custom Endpoint',
  };
  return labels[provider];
}

export function getCommitStyleLabel(style: CommitStyle): string {
  const labels: Record<CommitStyle, string> = {
    conventional: 'Conventional (Locale)',
    conventionalEn: 'Conventional (English)',
    custom: 'Custom Prompt',
  };
  return labels[style];
}

/** Providers that require an API key */
export function requiresApiKey(provider: ProviderType): boolean {
  return provider !== 'local';
}
