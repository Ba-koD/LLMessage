import * as vscode from 'vscode';
import { SecretManager } from './config/secrets';
import { registerGenerateCommitCommand } from './commands/generateCommit';
import {
  registerAddProfileCommand,
  registerSwitchProfileCommand,
  registerSwitchProfileToCommand,
  registerRemoveProfileCommand,
  registerEditProfileCommand,
  registerSetWorkspaceProfileCommand,
  registerClearWorkspaceProfileCommand,
  registerRefreshProfilesCommand,
  registerViewCustomPromptCommand,
  registerEditActiveProfileFieldCommand,
  registerToggleProfileScopeCommand,
  registerOpenSettingsJsonCommand,
  setRefreshCallback,
  registerPromptHandlers,
} from './commands/setApiKey';
import { ProfileTreeProvider, ActiveProfileInfoProvider } from './views/profileTree';
import { getConfig } from './config/settings';

export function activate(context: vscode.ExtensionContext) {
  const secretManager = new SecretManager(context.secrets);

  // ── TreeView Providers ──────────────────────────
  const profileTreeProvider = new ProfileTreeProvider();
  const activeInfoProvider = new ActiveProfileInfoProvider();

  const profilesTreeView = vscode.window.createTreeView('llmessage.profilesView', {
    treeDataProvider: profileTreeProvider,
    showCollapseAll: false,
  });

  vscode.window.createTreeView('llmessage.infoView', {
    treeDataProvider: activeInfoProvider,
    showCollapseAll: false,
  });

  // Wire up the refresh callback so commands can trigger view updates
  const refreshAll = () => {
    profileTreeProvider.refresh();
    activeInfoProvider.refresh();
    // Update noProfiles context for welcome view
    const aliases = Object.keys(getConfig().profiles);
    vscode.commands.executeCommand('setContext', 'llmessage.noProfiles', aliases.length === 0);
  };
  setRefreshCallback(refreshAll);

  // Register prompt handlers for global persistence
  context.subscriptions.push(registerPromptHandlers(context, refreshAll));

  // Initial context
  const aliases = Object.keys(getConfig().profiles);
  vscode.commands.executeCommand('setContext', 'llmessage.noProfiles', aliases.length === 0);

  // Refresh views when settings change
  const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('llmessage')) {
      refreshAll();
    }
  });

  // ── Register Commands ──────────────────────────
  context.subscriptions.push(
    profilesTreeView,
    configWatcher,
    registerGenerateCommitCommand(context, secretManager),
    registerAddProfileCommand(context, secretManager),
    registerSwitchProfileCommand(context),
    registerSwitchProfileToCommand(context),
    registerRemoveProfileCommand(context, secretManager),
    registerEditProfileCommand(context, secretManager),
    registerSetWorkspaceProfileCommand(context),
    registerClearWorkspaceProfileCommand(context),
    registerRefreshProfilesCommand(context),
    registerViewCustomPromptCommand(context),
    registerEditActiveProfileFieldCommand(context, secretManager),
    registerToggleProfileScopeCommand(context),
    registerOpenSettingsJsonCommand(),
  );

  console.log('LLMessage extension activated');
}

export function deactivate() {
  // Cleanup if needed
}
