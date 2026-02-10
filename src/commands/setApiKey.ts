import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
  ProviderType, Profile, CommitStyle,
  getProviderLabel, getCommitStyleLabel, requiresApiKey, getConfig, getActiveProfile, migrateProfile,
} from '../config/settings';
import { SecretManager } from '../config/secrets';

const PROVIDERS: { label: string; value: ProviderType; description: string }[] = [
  { label: 'OpenAI', value: 'openai', description: 'GPT-4o, GPT-4o-mini, etc.' },
  { label: 'Anthropic', value: 'anthropic', description: 'Claude Sonnet, etc.' },
  { label: 'Google Gemini', value: 'gemini', description: 'Gemini Flash, Pro, etc.' },
  { label: 'Local', value: 'local', description: 'Ollama, LM Studio, etc. (No API key)' },
  { label: 'Custom Endpoint', value: 'custom', description: 'OpenAI-compatible API' },
];

const SUGGESTED_MODELS: Record<ProviderType, { label: string; description: string }[]> = {
  openai: [
    { label: 'gpt-4o-mini', description: 'Fast & cheap (recommended)' },
    { label: 'gpt-4o', description: 'Most capable GPT-4o' },
    { label: 'gpt-4.1', description: 'Latest GPT-4.1' },
    { label: 'gpt-4.1-mini', description: 'GPT-4.1 mini' },
    { label: 'gpt-4.1-nano', description: 'GPT-4.1 nano — fastest' },
    { label: 'o3-mini', description: 'Reasoning model' },
  ],
  anthropic: [
    { label: 'claude-sonnet-4-20250514', description: 'Claude Sonnet 4 (recommended)' },
    { label: 'claude-opus-4-20250514', description: 'Claude Opus 4 — most capable' },
    { label: 'claude-haiku-3-5-20241022', description: 'Claude 3.5 Haiku — fastest' },
  ],
  gemini: [
    { label: 'gemini-2.5-flash', description: 'Fast & capable (recommended)' },
    { label: 'gemini-2.5-pro', description: 'Most capable Gemini' },
    { label: 'gemini-2.0-flash', description: 'Gemini 2.0 Flash' },
    { label: 'gemini-2.0-flash-lite', description: 'Lightweight & fast' },
  ],
  local: [
    { label: 'llama3.2', description: 'Llama 3.2 (recommended)' },
    { label: 'llama3.1', description: 'Llama 3.1' },
    { label: 'mistral', description: 'Mistral' },
    { label: 'codellama', description: 'Code Llama' },
    { label: 'deepseek-coder-v2', description: 'DeepSeek Coder V2' },
    { label: 'qwen2.5-coder', description: 'Qwen 2.5 Coder' },
  ],
  custom: [],
};

const COMMIT_STYLES: { label: string; value: CommitStyle; description: string }[] = [
  { label: 'Conventional (Locale)', value: 'conventional', description: 'Type: 설명 — locale 언어로 작성' },
  { label: 'Conventional (English)', value: 'conventionalEn', description: 'Type: Description — always in English' },
  { label: 'Custom Prompt', value: 'custom', description: 'Use your own prompt template' },
];

// ── Helpers ────────────────────────────────────────────

/** Show model picker: suggested list + free-text input. User can pick or type any model name directly. */
async function pickModel(provider: ProviderType): Promise<string> {
  const suggested = SUGGESTED_MODELS[provider];

  if (suggested.length === 0) {
    const input = await vscode.window.showInputBox({
      prompt: 'Enter model name (leave empty for default)',
      placeHolder: 'e.g., my-model',
      ignoreFocusOut: true,
    });
    return input?.trim() ?? '';
  }

  return new Promise<string>((resolve) => {
    const qp = vscode.window.createQuickPick();
    qp.title = `LLMessage: Select Model (${getProviderLabel(provider)})`;
    qp.placeholder = 'Select or type a model name (Enter to confirm)';
    qp.ignoreFocusOut = true;
    qp.matchOnDescription = true;

    const defaultItem = { label: '$(star) Use default', description: 'Let the provider choose', alwaysShow: true };
    const suggestedItems = suggested.map((m) => ({ label: m.label, description: m.description, alwaysShow: false }));
    qp.items = [defaultItem, ...suggestedItems];

    let resolved = false;

    qp.onDidAccept(() => {
      if (resolved) { return; }
      resolved = true;

      const selected = qp.selectedItems[0];
      if (selected && selected === defaultItem) {
        qp.dispose();
        resolve('');
        return;
      }

      // If an item is selected, use its label; otherwise use the typed text
      const value = selected ? selected.label : qp.value.trim();
      qp.dispose();
      resolve(value);
    });

    qp.onDidHide(() => {
      if (!resolved) {
        resolved = true;
        qp.dispose();
        resolve('');
      }
    });

    qp.show();
  });
}

/** Pick commit style + custom prompt */
async function pickCommitStyle(current?: CommitStyle, preserveCustomPrompt?: string): Promise<{ commitStyle: CommitStyle; customPrompt: string } | undefined> {
  const items = COMMIT_STYLES.map((s) => ({
    label: `${s.value === current ? '$(check) ' : ''}${s.label}`,
    description: s.description,
    value: s.value,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a commit message style',
    title: 'LLMessage: Commit Style',
    ignoreFocusOut: true,
  });

  if (!picked) { return undefined; }
  const commitStyle = (picked as any).value as CommitStyle;
  
  const result = { commitStyle, customPrompt: preserveCustomPrompt ?? '' };
  
  return result;
}

/** Pick locale */
async function pickLocale(current?: string): Promise<string | undefined> {
  const defaultLocale = current || vscode.env.language || 'en';
  const items = [
    { label: 'en', description: 'English' },
    { label: 'ko', description: '한국어' },
    { label: 'ja', description: '日本語' },
    { label: 'zh', description: '中文' },
    { label: 'es', description: 'Español' },
    { label: 'fr', description: 'Français' },
    { label: 'de', description: 'Deutsch' },
    { label: '$(pencil) Enter manually...', description: 'Type a locale code', isCustom: true },
  ];

  const picked = await vscode.window.showQuickPick(
    items.map((i) => ({
      ...i,
      label: `${i.label === defaultLocale ? '$(check) ' + i.label : i.label}`,
    })),
    {
      placeHolder: `Select language for commit messages (current: ${defaultLocale})`,
      title: 'LLMessage: Commit Message Language',
      ignoreFocusOut: true,
    },
  );

  if (!picked) { return undefined; }
  if ((picked as any).isCustom) {
    const input = await vscode.window.showInputBox({
      prompt: 'Enter locale code',
      placeHolder: 'e.g., pt-BR',
      ignoreFocusOut: true,
    });
    return input?.trim();
  }
  // Strip the checkmark prefix if present
  return picked.label.replace('$(check) ', '');
}

// Track active prompt editor documents to avoid duplicates
// Note: This map is cleared on reload, but global listeners handle persistence.
const activePromptEditors = new Map<string, string>();

/**
 * Register global event listeners for prompt files.
 * This ensures that saving a prompt file updates settings even after window reload.
 */
export function registerPromptHandlers(context: vscode.ExtensionContext, refreshViewsFn: () => void): vscode.Disposable {
  const storageDir = context.globalStorageUri.fsPath;

  // Helper to check if a document is a prompt file
  const isPromptFile = (fsPath: string) => {
    return fsPath.startsWith(storageDir) && path.basename(fsPath).startsWith('prompt-');
  };

  // Helper to extract alias from filename: prompt-{alias}.txt
  const getAliasFromPath = (fsPath: string) => {
    const filename = path.basename(fsPath); // prompt-Alias.txt
    const match = filename.match(/^prompt-(.+)\.txt$/);
    return match ? match[1] : null; // "Alias" (Note: this is the safe alias, but usually close enough. 
    // Ideally we should store mapping, but across reloads we rely on filename.
    // Since safeAlias replaces chars, we might have collisions or inability to map back perfectly if alias had special chars.
    // However, for the current implementation, we can try to find the profile that matches this safe alias.
    // Or better, we can assume the alias doesn't have crazy characters or we accept that "My Profile" becomes "My_Profile" in filename.
    // Let's improve the mapping strategy if needed, but for now, let's reverse the safe logic or search profiles.
  };

  // We need a way to map safeAlias back to real alias.
  // We can scan all profiles and see which one produces this safeAlias.
  const findProfileBySafeAlias = (safeAlias: string) => {
    const profiles = getConfig().profiles;
    return Object.keys(profiles).find(alias => alias.replace(/[^a-zA-Z0-9_-]/g, '_') === safeAlias);
  };

  const saveDisposable = vscode.workspace.onDidSaveTextDocument(async (saved) => {
    if (isPromptFile(saved.uri.fsPath)) {
      const safeAlias = getAliasFromPath(saved.uri.fsPath);
      if (!safeAlias) { return; }

      const realAlias = findProfileBySafeAlias(safeAlias);
      if (!realAlias) { return; }

      const newContent = saved.getText().trim();
      
      const config = vscode.workspace.getConfiguration('llmessage');
      const profiles = JSON.parse(JSON.stringify(config.get<Record<string, Profile>>('profiles', {})));
      
      if (profiles[realAlias]) {
        // Only update if changed
        if (profiles[realAlias].customPrompt !== newContent) {
          profiles[realAlias].customPrompt = newContent;
          await config.update('profiles', profiles, getConfigTarget(config));
          refreshViewsFn();
          vscode.window.showInformationMessage(`LLMessage: Custom prompt saved for "${realAlias}".`);
        }
      }
    }
  });

  const closeDisposable = vscode.workspace.onDidCloseTextDocument((closed) => {
    if (isPromptFile(closed.uri.fsPath)) {
      const safeAlias = getAliasFromPath(closed.uri.fsPath);
      if (!safeAlias) { return; }
      
      // Cleanup file
      try { 
        if (fs.existsSync(closed.uri.fsPath)) {
            fs.unlinkSync(closed.uri.fsPath); 
        }
      } catch {}
      
      const realAlias = findProfileBySafeAlias(safeAlias);
      if (realAlias) {
        activePromptEditors.delete(realAlias);
      }
    }
  });

  return vscode.Disposable.from(saveDisposable, closeDisposable);
}

/**
 * Helper to get the configuration target (Global or Workspace) based on where 'profiles' is defined.
 */
function getConfigTarget(config: vscode.WorkspaceConfiguration): vscode.ConfigurationTarget {
  const inspection = config.inspect('profiles');
  if (inspection?.workspaceValue !== undefined) {
    return vscode.ConfigurationTarget.Workspace;
  }
  return vscode.ConfigurationTarget.Global;
}

/**
 * Helper to get the latest custom prompt.
 * Prioritizes the file on disk (if it exists) to avoid race conditions with stale settings.
 */
function getLatestCustomPrompt(context: vscode.ExtensionContext, alias: string, currentFromSettings: string): string {
  const storageDir = context.globalStorageUri.fsPath;
  const safeAlias = alias.replace(/[^a-zA-Z0-9_-]/g, '_');
  const promptFile = path.join(storageDir, `prompt-${safeAlias}.txt`);
  
  if (fs.existsSync(promptFile)) {
    try {
      const content = fs.readFileSync(promptFile, 'utf-8');
      // If file is empty, maybe fallback to settings? But empty file might be intentional.
      // Let's assume file is authority.
      return content;
    } catch {
      // ignore read error
    }
  }
  return currentFromSettings;
}

/**
 * Open a temp file in globalStorage for editing a custom prompt.
 * Ctrl+S saves to disk AND writes to settings.json profiles (syncs via Settings Sync).
 * Tab close deletes the temp file.
 */
export function editCustomPromptInEditor(
  context: vscode.ExtensionContext,
  alias: string,
  currentPrompt?: string,
): void {
  const defaultTemplate =
`You are a commit message helper. Write a commit message for me.

Format:
- First line: English title (imperative mood, under 72 chars)
- Blank line
- Bullet points in {{locale}} language, ~구현/~수정/~추가/~제거 style (if Korean)
- Each bullet: ONE short line (max 1-2 lines)

Example:
Feat: Remove unnecessary comments from User class

- 주석 처리된 코드와 오래된 주석 제거
- 코드 깔끔함 향상 및 클러터 감소

Git diff:
\`\`\`
{{diff}}
\`\`\``;

  // If an editor for this alias is already open, focus it
  if (activePromptEditors.has(alias)) {
    const existingPath = activePromptEditors.get(alias)!;
    const existingDoc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === existingPath);
    if (existingDoc) {
      vscode.window.showTextDocument(existingDoc, { preview: false });
      return;
    }
    // If not found in documents (closed?), remove from map
    activePromptEditors.delete(alias);
  }

  // Use globalStorage as temp buffer for editing
  const storageDir = context.globalStorageUri.fsPath;
  try { fs.mkdirSync(storageDir, { recursive: true }); } catch {}

  const safeAlias = alias.replace(/[^a-zA-Z0-9_-]/g, '_');
  const promptFile = path.join(storageDir, `prompt-${safeAlias}.txt`);

  // Check if file already exists and has content.
  // If currentPrompt is empty/undefined, BUT the file exists on disk with content,
  // it might mean the user reloaded the window and had unsaved changes or just the file persisted.
  // However, we should prioritize what is in settings.json (currentPrompt).
  // But if currentPrompt is empty, and file exists, maybe we should read from file?
  // No, settings.json is the source of truth. 
  // If currentPrompt is provided, use it.
  // If currentPrompt is empty/undefined, use default template.
  
  let content = currentPrompt;
  
  if (!content) {
    // If no prompt in settings, check if file exists and has content (recovery)
    // This handles cases where settings update failed but file was saved,
    // or if the user reloads and the file is still there.
    if (fs.existsSync(promptFile)) {
      try {
        const diskContent = fs.readFileSync(promptFile, 'utf-8').trim();
        if (diskContent.length > 0) {
          content = diskContent;
        }
      } catch {}
    }
  }
  
  // If still empty (no settings, no file), use default template
  if (!content) {
    content = defaultTemplate;
  }

  // Optimize: Only write if content is different to avoid touching file timestamp/triggering watchers unnecessarily
  let needsWrite = true;
  if (fs.existsSync(promptFile)) {
    const existing = fs.readFileSync(promptFile, 'utf-8');
    if (existing === content) {
      needsWrite = false;
    }
  }

  if (needsWrite) {
    fs.writeFileSync(promptFile, content, 'utf-8');
  }

  const uri = vscode.Uri.file(promptFile);
  activePromptEditors.set(alias, promptFile);

  vscode.workspace.openTextDocument(uri).then((doc) => {
    vscode.window.showTextDocument(doc, { preview: false }).then(() => {
        // No local listeners needed anymore
    });
  });
}

/** Callback type for refreshing views after profile changes */
export type RefreshCallback = () => void;

let _refreshCallback: RefreshCallback | undefined;

export function setRefreshCallback(cb: RefreshCallback) {
  _refreshCallback = cb;
}

function refreshViews() {
  _refreshCallback?.();
}

// ── Commands ────────────────────────────────────────────

/**
 * Command: Add a new profile.
 */
export function registerAddProfileCommand(
  context: vscode.ExtensionContext,
  secretManager: SecretManager,
): vscode.Disposable {
  return vscode.commands.registerCommand('llmessage.addProfile', async () => {
    // 1. Alias
    const alias = await vscode.window.showInputBox({
      prompt: 'Enter a name for this profile',
      placeHolder: 'e.g., My GPT-4o, Work Gemini, Local Llama',
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value || value.trim().length === 0) { return 'Profile name cannot be empty'; }
        if (getConfig().profiles[value.trim()]) { return `Profile "${value.trim()}" already exists`; }
        return undefined;
      },
    });
    if (!alias) { return; }
    const trimmedAlias = alias.trim();

    // 2. Provider
    const picked = await vscode.window.showQuickPick(
      PROVIDERS.map((p) => ({ label: p.label, description: p.description, value: p.value })),
      { placeHolder: 'Select an AI provider', title: `LLMessage: Profile "${trimmedAlias}" — Provider` },
    );
    if (!picked) { return; }
    const provider = (picked as any).value as ProviderType;

    // 3. API Key
    if (requiresApiKey(provider)) {
      const apiKey = await vscode.window.showInputBox({
        prompt: `Enter your ${getProviderLabel(provider)} API key`,
        placeHolder: 'sk-...',
        password: true,
        ignoreFocusOut: true,
        validateInput: (v) => (!v?.trim() ? 'API key cannot be empty' : undefined),
      });
      if (!apiKey) { return; }
      await secretManager.setApiKey(trimmedAlias, apiKey.trim());
    }

    // 4. Model
    const modelName = await pickModel(provider);

    // 5. Commit Style
    const styleResult = await pickCommitStyle();
    if (!styleResult) { return; }

    // 6. Locale
    const locale = await pickLocale() ?? vscode.env.language ?? 'en';

    // 7. Save profile
    const config = vscode.workspace.getConfiguration('llmessage');
    const profiles = JSON.parse(JSON.stringify(config.get<Record<string, Profile>>('profiles', {})));
    profiles[trimmedAlias] = {
      provider,
      model: modelName,
      commitStyle: styleResult.commitStyle,
      customPrompt: getLatestCustomPrompt(context, trimmedAlias, styleResult.customPrompt),
      locale,
    };
    await config.update('profiles', profiles, getConfigTarget(config));
    await config.update('activeProfile', trimmedAlias, vscode.ConfigurationTarget.Global);

    refreshViews();
    vscode.window.showInformationMessage(
      `LLMessage: Profile "${trimmedAlias}" saved & activated ` +
      `(${getProviderLabel(provider)}${modelName ? ' / ' + modelName : ', default model'})`
    );

    // If custom style, open editor for prompt
    if (styleResult.commitStyle === 'custom') {
      editCustomPromptInEditor(context, trimmedAlias);
    }
  });
}

/**
 * Command: Switch between saved profiles (via QuickPick).
 */
export function registerSwitchProfileCommand(
  context: vscode.ExtensionContext,
): vscode.Disposable {
  return vscode.commands.registerCommand('llmessage.switchProfile', async () => {
    const { profiles, activeProfile } = getConfig();
    const aliases = Object.keys(profiles);

    if (aliases.length === 0) {
      const add = await vscode.window.showInformationMessage('No profiles saved yet.', 'Add Profile');
      if (add === 'Add Profile') { vscode.commands.executeCommand('llmessage.addProfile'); }
      return;
    }

    const items = aliases.map((a) => {
      const p = migrateProfile(profiles[a]);
      return {
        label: `${a === activeProfile ? '$(check) ' : ''}${a}`,
        description: `${getProviderLabel(p.provider)}${p.model ? ' / ' + p.model : ''}`,
        alias: a,
      };
    });

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Switch to profile...',
      title: 'LLMessage: Switch Profile',
    });
    if (!picked) { return; }

    await vscode.workspace.getConfiguration('llmessage')
      .update('activeProfile', picked.alias, vscode.ConfigurationTarget.Global);

    refreshViews();
    const p = migrateProfile(profiles[picked.alias]);
    vscode.window.showInformationMessage(
      `LLMessage: Switched to "${picked.alias}" (${getProviderLabel(p.provider)}${p.model ? ' / ' + p.model : ''})`
    );
  });
}

/**
 * Command: Switch to a specific profile by alias (from TreeView click).
 * If no alias provided, show QuickPick to select a profile.
 */
export function registerSwitchProfileToCommand(
  context: vscode.ExtensionContext,
): vscode.Disposable {
  return vscode.commands.registerCommand('llmessage.switchProfileTo', async (alias?: string) => {
    const { profiles } = getConfig();
    const aliases = Object.keys(profiles);
    
    if (aliases.length === 0) {
      vscode.window.showInformationMessage('No profiles configured yet.');
      return;
    }

    let selectedAlias = alias;

    if (!selectedAlias) {
      const items = aliases.map((a) => {
        const p = migrateProfile(profiles[a]);
        return { 
          label: a, 
          description: `${getProviderLabel(p.provider)}${p.model ? ' / ' + p.model : ''}` 
        };
      });
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a profile to switch to',
        title: 'LLMessage: Switch Profile',
      });
      if (!picked) { return; }
      selectedAlias = picked.label;
    }

    if (!profiles[selectedAlias]) { return; }

    await vscode.workspace.getConfiguration('llmessage')
      .update('activeProfile', selectedAlias, vscode.ConfigurationTarget.Global);

    refreshViews();
    const p = migrateProfile(profiles[selectedAlias]);
    vscode.window.showInformationMessage(
      `LLMessage: Switched to "${selectedAlias}" (${getProviderLabel(p.provider)})`
    );
  });
}

/**
 * Command: Remove a saved profile.
 * Accepts optional alias arg from TreeView context menu.
 */
export function registerRemoveProfileCommand(
  context: vscode.ExtensionContext,
  secretManager: SecretManager,
): vscode.Disposable {
  return vscode.commands.registerCommand('llmessage.removeProfile', async (treeItem?: any) => {
    const config = vscode.workspace.getConfiguration('llmessage');
    let profiles = config.get<Record<string, Profile>>('profiles', {});

    let targetAlias: string | undefined;

    // From TreeView context menu
    if (treeItem?.alias) {
      targetAlias = treeItem.alias;
    } else {
      const aliases = Object.keys(profiles);
      if (aliases.length === 0) {
        vscode.window.showInformationMessage('No profiles to remove.');
        return;
      }
      const items = aliases.map((a) => {
        const p = migrateProfile(profiles[a]);
        return { label: a, description: `${getProviderLabel(p.provider)}${p.model ? ' / ' + p.model : ''}` };
      });
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a profile to remove',
        title: 'LLMessage: Remove Profile',
      });
      if (!picked) { return; }
      targetAlias = picked.label;
    }

    if (!targetAlias) { return; }

    // Confirm
    const confirm = await vscode.window.showWarningMessage(
      `Remove profile "${targetAlias}"?`,
      { modal: true },
      'Remove',
    );
    if (confirm !== 'Remove') { return; }

    await secretManager.removeApiKey(targetAlias);
    profiles = JSON.parse(JSON.stringify(config.get<Record<string, Profile>>('profiles', {})));
    delete profiles[targetAlias];
    await config.update('profiles', profiles, getConfigTarget(config));

    const active = config.get<string>('activeProfile', '');
    if (active === targetAlias) {
      const remaining = Object.keys(profiles);
      await config.update('activeProfile', remaining.length > 0 ? remaining[0] : '', vscode.ConfigurationTarget.Global);
    }

    refreshViews();
    vscode.window.showInformationMessage(`LLMessage: Profile "${targetAlias}" removed.`);
  });
}

/**
 * Command: Edit an existing profile.
 * Accepts optional alias arg from TreeView context menu.
 */
export function registerEditProfileCommand(
  context: vscode.ExtensionContext,
  secretManager: SecretManager,
): vscode.Disposable {
  return vscode.commands.registerCommand('llmessage.editProfile', async (treeItem?: any) => {
    const config = vscode.workspace.getConfiguration('llmessage');
    // Always clone for editing
    const profiles = JSON.parse(JSON.stringify(config.get<Record<string, Profile>>('profiles', {})));

    let alias: string;

    if (treeItem?.alias) {
      alias = treeItem.alias;
    } else {
      const aliases = Object.keys(profiles);
      if (aliases.length === 0) {
        const add = await vscode.window.showInformationMessage('No profiles to edit.', 'Add Profile');
        if (add === 'Add Profile') { vscode.commands.executeCommand('llmessage.addProfile'); }
        return;
      }
      const items = aliases.map((a) => {
        const p = migrateProfile(profiles[a]);
        return { label: a, description: `${getProviderLabel(p.provider)}${p.model ? ' / ' + p.model : ' / default'}` };
      });
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a profile to edit',
        title: 'LLMessage: Edit Profile',
      });
      if (!picked) { return; }
      alias = picked.label;
    }

    const current = migrateProfile(profiles[alias]);

    // What to edit?
    const field = await vscode.window.showQuickPick(
      [
        { label: '$(key) API Key', description: 'Change the API key', value: 'apikey' },
        { label: '$(server) Provider', description: `Current: ${getProviderLabel(current.provider)}`, value: 'provider' },
        { label: '$(symbol-method) Model', description: `Current: ${current.model || 'default'}`, value: 'model' },
        { label: '$(edit) Commit Style', description: `Current: ${getCommitStyleLabel(current.commitStyle)}`, value: 'commitStyle' },
        { label: '$(globe) Locale', description: `Current: ${current.locale}`, value: 'locale' },
        { label: '$(pencil) Rename', description: `Current name: ${alias}`, value: 'rename' },
      ],
      {
        placeHolder: `What do you want to change in "${alias}"?`,
        title: `LLMessage: Edit "${alias}"`,
      },
    );
    if (!field) { return; }

    const action = (field as any).value as string;

    switch (action) {
      case 'apikey': {
        if (!requiresApiKey(current.provider)) {
          vscode.window.showInformationMessage(`${getProviderLabel(current.provider)} doesn't use an API key.`);
          return;
        }
        const apiKey = await vscode.window.showInputBox({
          prompt: `Enter new API key for "${alias}"`,
          placeHolder: 'sk-...',
          password: true,
          ignoreFocusOut: true,
          validateInput: (v) => (!v?.trim() ? 'API key cannot be empty' : undefined),
        });
        if (!apiKey) { return; }
        await secretManager.setApiKey(alias, apiKey.trim());
        vscode.window.showInformationMessage(`LLMessage: API key updated for "${alias}".`);
        break;
      }

      case 'provider': {
        const providerPick = await vscode.window.showQuickPick(
          PROVIDERS.map((p) => ({
            label: p.label,
            description: p.value === current.provider ? '$(check) current' : p.description,
            value: p.value,
          })),
          { placeHolder: 'Select new provider', title: `LLMessage: Change Provider for "${alias}"` },
        );
        if (!providerPick) { return; }
        const newProvider = (providerPick as any).value as ProviderType;

        if (requiresApiKey(newProvider) && newProvider !== current.provider) {
          const apiKey = await vscode.window.showInputBox({
            prompt: `Enter your ${getProviderLabel(newProvider)} API key`,
            placeHolder: 'sk-...',
            password: true,
            ignoreFocusOut: true,
            validateInput: (v) => (!v?.trim() ? 'API key cannot be empty' : undefined),
          });
          if (!apiKey) { return; }
          await secretManager.setApiKey(alias, apiKey.trim());
        }

        const modelName = await pickModel(newProvider);
        profiles[alias] = { ...current, provider: newProvider, model: modelName, customPrompt: getLatestCustomPrompt(context, alias, current.customPrompt) };
        await config.update('profiles', profiles, getConfigTarget(config));
        refreshViews();
        vscode.window.showInformationMessage(
          `LLMessage: "${alias}" → ${getProviderLabel(newProvider)}${modelName ? ' / ' + modelName : ''}`
        );
        break;
      }

      case 'model': {
        const modelName = await pickModel(current.provider);
        profiles[alias] = { ...current, model: modelName, customPrompt: getLatestCustomPrompt(context, alias, current.customPrompt) };
        await config.update('profiles', profiles, getConfigTarget(config));
        refreshViews();
        vscode.window.showInformationMessage(`LLMessage: "${alias}" model → ${modelName || 'default'}`);
        break;
      }

      case 'commitStyle': {
        const latestPrompt = getLatestCustomPrompt(context, alias, current.customPrompt);
        const result = await pickCommitStyle(current.commitStyle, latestPrompt);
        if (!result) { return; }

        profiles[alias] = { ...current, commitStyle: result.commitStyle, customPrompt: latestPrompt };
        
        await config.update('profiles', profiles, getConfigTarget(config));
        refreshViews();
        vscode.window.showInformationMessage(
          `LLMessage: "${alias}" style → ${getCommitStyleLabel(result.commitStyle)}`
        );

        if (result.commitStyle === 'custom') {
          editCustomPromptInEditor(context, alias, latestPrompt);
        }
        break;
      }

      case 'locale': {
        const locale = await pickLocale(current.locale);
        if (!locale) { return; }
        profiles[alias] = { ...current, locale, customPrompt: getLatestCustomPrompt(context, alias, current.customPrompt) };
        await config.update('profiles', profiles, getConfigTarget(config));
        refreshViews();
        vscode.window.showInformationMessage(`LLMessage: "${alias}" locale → ${locale}`);
        break;
      }

      case 'rename': {
        const newName = await vscode.window.showInputBox({
          prompt: 'Enter new profile name',
          value: alias,
          ignoreFocusOut: true,
          validateInput: (v) => {
            if (!v?.trim()) { return 'Name cannot be empty'; }
            if (v.trim() !== alias && profiles[v.trim()]) { return `"${v.trim()}" already exists`; }
            return undefined;
          },
        });
        if (!newName || newName.trim() === alias) { return; }
        const trimmed = newName.trim();

        const existingKey = await secretManager.getApiKey(alias);
        if (existingKey) {
          await secretManager.setApiKey(trimmed, existingKey);
          await secretManager.removeApiKey(alias);
        }

        profiles[trimmed] = { ...current, customPrompt: getLatestCustomPrompt(context, alias, current.customPrompt) };
        delete profiles[alias];
        await config.update('profiles', profiles, getConfigTarget(config));

        const active = config.get<string>('activeProfile', '');
        if (active === alias) {
          await config.update('activeProfile', trimmed, vscode.ConfigurationTarget.Global);
        }

        refreshViews();
        vscode.window.showInformationMessage(`LLMessage: Renamed "${alias}" → "${trimmed}".`);
        break;
      }
    }
  });
}

/**
 * Command: Set active profile for current workspace/project.
 */
export function registerSetWorkspaceProfileCommand(
  context: vscode.ExtensionContext,
): vscode.Disposable {
  return vscode.commands.registerCommand('llmessage.setActiveProfileForWorkspace', async (treeItem?: any) => {
    const { profiles } = getConfig();

    let targetAlias: string | undefined;

    if (treeItem?.alias) {
      targetAlias = treeItem.alias;
    } else {
      const aliases = Object.keys(profiles);
      if (aliases.length === 0) { return; }
      const picked = await vscode.window.showQuickPick(
        aliases.map((a) => ({ label: a, description: getProviderLabel(migrateProfile(profiles[a]).provider) })),
        { placeHolder: 'Pin a profile to this project', title: 'LLMessage: Set Workspace Profile' },
      );
      if (!picked) { return; }
      targetAlias = picked.label;
    }

    if (!targetAlias) { return; }

    await vscode.workspace.getConfiguration('llmessage')
      .update('workspaceProfile', targetAlias, vscode.ConfigurationTarget.Workspace);

    refreshViews();
    vscode.window.showInformationMessage(
      `LLMessage: Profile "${targetAlias}" pinned to this project.`
    );
  });
}

/**
 * Command: Clear workspace-level profile override.
 */
export function registerClearWorkspaceProfileCommand(
  context: vscode.ExtensionContext,
): vscode.Disposable {
  return vscode.commands.registerCommand('llmessage.clearWorkspaceProfile', async () => {
    await vscode.workspace.getConfiguration('llmessage')
      .update('workspaceProfile', undefined, vscode.ConfigurationTarget.Workspace);

    refreshViews();
    vscode.window.showInformationMessage('LLMessage: Project-specific profile cleared. Using global profile.');
  });
}

/**
 * Command: View / edit the custom prompt for a profile in an editor tab.
 */
export function registerViewCustomPromptCommand(
  context: vscode.ExtensionContext,
): vscode.Disposable {
  return vscode.commands.registerCommand('llmessage.viewCustomPrompt', async (alias?: string) => {
    const config = vscode.workspace.getConfiguration('llmessage');
    const profiles = config.get<Record<string, Profile>>('profiles', {});

    if (!alias) {
      const active = getActiveProfile();
      alias = active?.alias;
    }
    if (!alias || !profiles[alias]) {
      vscode.window.showWarningMessage('LLMessage: No profile found.');
      return;
    }

    const current = migrateProfile(profiles[alias]);
    editCustomPromptInEditor(context, alias, current.customPrompt);
  });
}

/**
 * Command: Open settings.json to edit profiles directly.
 */
export function registerOpenSettingsJsonCommand(): vscode.Disposable {
  return vscode.commands.registerCommand('llmessage.openSettingsJson', async () => {
    await vscode.commands.executeCommand('workbench.action.openSettingsJson', { revealSetting: { key: 'llmessage.profiles' } });
  });
}

/**
 * Command: Refresh tree views.
 */
export function registerRefreshProfilesCommand(
  context: vscode.ExtensionContext,
): vscode.Disposable {
  return vscode.commands.registerCommand('llmessage.refreshProfiles', () => {
    refreshViews();
  });
}

/**
 * Command: Toggle profile scope between global and project.
 * If currently global -> pin the active profile to this workspace.
 * If currently project-specific -> clear the workspace override.
 */
export function registerToggleProfileScopeCommand(
  context: vscode.ExtensionContext,
): vscode.Disposable {
  return vscode.commands.registerCommand('llmessage.toggleProfileScope', async () => {
    const config = vscode.workspace.getConfiguration('llmessage');
    const workspaceProfile = config.get<string>('workspaceProfile', '');

    if (workspaceProfile) {
      // Currently project-scoped -> clear override (go global)
      await config.update('workspaceProfile', undefined, vscode.ConfigurationTarget.Workspace);
      refreshViews();
      vscode.window.showInformationMessage(
        `LLMessage: Scope \u2192 Global (\ud504\ub85c\uc81d\ud2b8 \uace0\uc815 \ud574\uc81c)`
      );
    } else {
      // Currently global -> pin active profile to this workspace
      const active = getActiveProfile();
      if (!active) {
        vscode.window.showWarningMessage('LLMessage: No active profile to pin.');
        return;
      }

      // Show options: pin current or pick another
      const profiles = config.get<Record<string, any>>('profiles', {});
      const aliases = Object.keys(profiles);
      const items = [
        { label: `$(pin) Pin "${active.alias}"`, description: 'Current active profile', alias: active.alias },
        ...aliases
          .filter((a) => a !== active.alias)
          .map((a) => ({ label: a, description: getProviderLabel(migrateProfile(profiles[a]).provider), alias: a })),
      ];

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a profile to pin to this project',
        title: 'LLMessage: Pin Profile to Project',
      });
      if (!picked) { return; }

      await config.update('workspaceProfile', (picked as any).alias, vscode.ConfigurationTarget.Workspace);
      refreshViews();
      vscode.window.showInformationMessage(
        `LLMessage: Scope \u2192 Project ("${(picked as any).alias}" pinned)`
      );
    }
  });
}

/**
 * Command: Edit a specific field of the active profile directly.
 * Called from the Active Profile info panel (click or inline button).
 */
export function registerEditActiveProfileFieldCommand(
  context: vscode.ExtensionContext,
  secretManager: SecretManager,
): vscode.Disposable {
  return vscode.commands.registerCommand('llmessage.editActiveProfileField', async (fieldOrItem?: string | any) => {
    const active = getActiveProfile();
    if (!active) {
      vscode.window.showWarningMessage('LLMessage: No active profile.');
      return;
    }

    const config = vscode.workspace.getConfiguration('llmessage');
    // Always clone for editing
    const profiles = JSON.parse(JSON.stringify(config.get<Record<string, Profile>>('profiles', {})));
    const alias = active.alias;
    const current = migrateProfile(profiles[alias]);

    // Determine which field to edit
    let field: string | undefined;
    if (typeof fieldOrItem === 'string') {
      field = fieldOrItem;
    } else if (fieldOrItem?.contextValue) {
      // From TreeItem inline button: contextValue = 'infoField-provider' etc.
      field = fieldOrItem.contextValue.replace('infoField-', '');
    }

    if (!field) {
      // Fallback: show picker
      const pick = await vscode.window.showQuickPick(
        [
          { label: '$(key) API Key', value: 'apikey' },
          { label: '$(server) Provider', value: 'provider' },
          { label: '$(symbol-method) Model', value: 'model' },
          { label: '$(edit) Commit Style', value: 'commitStyle' },
          { label: '$(globe) Locale', value: 'locale' },
          { label: '$(pencil) Rename', value: 'rename' },
        ],
        { placeHolder: `Edit "${alias}"` },
      );
      if (!pick) { return; }
      field = (pick as any).value;
    }

    switch (field) {
      case 'apikey': {
        if (!requiresApiKey(current.provider)) {
          vscode.window.showInformationMessage(`${getProviderLabel(current.provider)} doesn't use an API key.`);
          return;
        }
        const apiKey = await vscode.window.showInputBox({
          prompt: `Enter new API key for "${alias}"`,
          placeHolder: 'sk-...',
          password: true,
          ignoreFocusOut: true,
          validateInput: (v) => (!v?.trim() ? 'API key cannot be empty' : undefined),
        });
        if (!apiKey) { return; }
        await secretManager.setApiKey(alias, apiKey.trim());
        vscode.window.showInformationMessage(`LLMessage: API key updated.`);
        break;
      }
      case 'provider': {
        const PROVIDERS_LIST = [
          { label: 'OpenAI', value: 'openai' },
          { label: 'Anthropic', value: 'anthropic' },
          { label: 'Google Gemini', value: 'gemini' },
          { label: 'Local', value: 'local' },
          { label: 'Custom Endpoint', value: 'custom' },
        ];
        const providerPick = await vscode.window.showQuickPick(
          PROVIDERS_LIST.map((p) => ({
            label: p.value === current.provider ? `$(check) ${p.label}` : p.label,
            value: p.value,
          })),
          { placeHolder: 'Select new provider' },
        );
        if (!providerPick) { return; }
        const newProvider = (providerPick as any).value as ProviderType;
        if (requiresApiKey(newProvider) && newProvider !== current.provider) {
          const apiKey = await vscode.window.showInputBox({
            prompt: `Enter your ${getProviderLabel(newProvider)} API key`,
            placeHolder: 'sk-...',
            password: true,
            ignoreFocusOut: true,
            validateInput: (v) => (!v?.trim() ? 'API key cannot be empty' : undefined),
          });
          if (!apiKey) { return; }
          await secretManager.setApiKey(alias, apiKey.trim());
        }
        const modelName = await pickModel(newProvider);
        profiles[alias] = { ...current, provider: newProvider, model: modelName, customPrompt: getLatestCustomPrompt(context, alias, current.customPrompt) };
        await config.update('profiles', profiles, getConfigTarget(config));
        refreshViews();
        vscode.window.showInformationMessage(`LLMessage: Provider \u2192 ${getProviderLabel(newProvider)}`);
        break;
      }
      case 'model': {
        const modelName = await pickModel(current.provider);
        profiles[alias] = { ...current, model: modelName, customPrompt: getLatestCustomPrompt(context, alias, current.customPrompt) };
        await config.update('profiles', profiles, getConfigTarget(config));
        refreshViews();
        vscode.window.showInformationMessage(`LLMessage: Model \u2192 ${modelName || 'default'}`);
        break;
      }
      case 'commitStyle': {
        const latestPrompt = getLatestCustomPrompt(context, alias, current.customPrompt);
        const result = await pickCommitStyle(current.commitStyle, latestPrompt);
        if (!result) { return; }

        profiles[alias] = { ...current, commitStyle: result.commitStyle, customPrompt: latestPrompt };
        
        await config.update('profiles', profiles, getConfigTarget(config));
        refreshViews();
        vscode.window.showInformationMessage(`LLMessage: Style \u2192 ${getCommitStyleLabel(result.commitStyle)}`);
        if (result.commitStyle === 'custom') {
          editCustomPromptInEditor(context, alias, latestPrompt);
        }
        break;
      }
      case 'locale': {
        const locale = await pickLocale(current.locale);
        if (!locale) { return; }
        profiles[alias] = { ...current, locale, customPrompt: getLatestCustomPrompt(context, alias, current.customPrompt) };
        await config.update('profiles', profiles, getConfigTarget(config));
        refreshViews();
        vscode.window.showInformationMessage(`LLMessage: Locale \u2192 ${locale}`);
        break;
      }
      case 'rename': {
        const newName = await vscode.window.showInputBox({
          prompt: 'Enter new profile name',
          value: alias,
          ignoreFocusOut: true,
          validateInput: (v) => {
            if (!v?.trim()) { return 'Name cannot be empty'; }
            if (v.trim() !== alias && profiles[v.trim()]) { return `"${v.trim()}" already exists`; }
            return undefined;
          },
        });
        if (!newName || newName.trim() === alias) { return; }
        const trimmed = newName.trim();
        const existingKey = await secretManager.getApiKey(alias);
        if (existingKey) {
          await secretManager.setApiKey(trimmed, existingKey);
          await secretManager.removeApiKey(alias);
        }
        profiles[trimmed] = { ...current, customPrompt: getLatestCustomPrompt(context, alias, current.customPrompt) };
        delete profiles[alias];
        await config.update('profiles', profiles, getConfigTarget(config));
        const act = config.get<string>('activeProfile', '');
        if (act === alias) {
          await config.update('activeProfile', trimmed, vscode.ConfigurationTarget.Global);
        }
        refreshViews();
        vscode.window.showInformationMessage(`LLMessage: Renamed \u2192 "${trimmed}"`);
        break;
      }
    }
  });
}
