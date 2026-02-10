import * as vscode from 'vscode';
import { Profile, getConfig, getActiveProfile, getProviderLabel, getCommitStyleLabel, migrateProfile, requiresApiKey } from '../config/settings';

/**
 * TreeView provider for the LLMessage sidebar — shows all profiles.
 */
export class ProfileTreeProvider implements vscode.TreeDataProvider<ProfileItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ProfileItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ProfileItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ProfileItem): ProfileItem[] {
    if (element) {
      return []; // No children
    }

    const { profiles } = getConfig();
    const active = getActiveProfile();
    const aliases = Object.keys(profiles);

    // Set context for welcome view
    vscode.commands.executeCommand(
      'setContext',
      'llmessage.noProfiles',
      aliases.length === 0,
    );

    return aliases.map((alias) => {
      const p = migrateProfile(profiles[alias]);
      const isActive = active?.alias === alias;
      return new ProfileItem(alias, p, isActive);
    });
  }
}

export class ProfileItem extends vscode.TreeItem {
  constructor(
    public readonly alias: string,
    public readonly profile: Profile,
    public readonly isActive: boolean,
  ) {
    super(alias, vscode.TreeItemCollapsibleState.None);

    const provider = getProviderLabel(profile.provider);
    const model = profile.model || 'default';
    const style = getCommitStyleLabel(profile.commitStyle);

    this.description = `${provider} · ${model}`;
    this.tooltip = new vscode.MarkdownString(
      `**${alias}** ${isActive ? '✅ Active' : ''}\n\n` +
      `- **Provider:** ${provider}\n` +
      `- **Model:** ${model}\n` +
      `- **Style:** ${style}\n` +
      `- **Locale:** ${profile.locale}\n` +
      (profile.commitStyle === 'custom' && profile.customPrompt
        ? `- **Prompt:** \`${profile.customPrompt.substring(0, 80)}...\``
        : ''),
    );

    this.iconPath = isActive
      ? new vscode.ThemeIcon('star-full', new vscode.ThemeColor('charts.yellow'))
      : new vscode.ThemeIcon('account');

    this.contextValue = 'profile';

    // Click to switch
    this.command = {
      command: 'llmessage.switchProfileTo',
      title: 'Switch to this profile',
      arguments: [alias],
    };
  }
}

/**
 * TreeView provider for the "Active Profile" info panel.
 */
export class ActiveProfileInfoProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.TreeItem[] {
    const config = getConfig();
    const active = getActiveProfile();

    if (!active) {
      const item = new vscode.TreeItem('No active profile');
      item.description = 'Add one from Profiles above';
      item.iconPath = new vscode.ThemeIcon('warning');
      return [item];
    }

    const p = migrateProfile(active);
    const isWorkspace = !!config.workspaceProfile && config.workspaceProfile === active.alias;

    const items: vscode.TreeItem[] = [];

    const nameItem = new vscode.TreeItem(`${active.alias}`);
    nameItem.iconPath = new vscode.ThemeIcon('star-full', new vscode.ThemeColor('charts.yellow'));
    nameItem.contextValue = 'infoField-rename';
    nameItem.command = {
      command: 'llmessage.editActiveProfileField',
      title: 'Rename',
      arguments: ['rename'],
    };
    items.push(nameItem);

    // Scope toggle item
    const scopeLabel = isWorkspace ? 'Scope: Project' : 'Scope: Global';
    const scopeItem = new vscode.TreeItem(scopeLabel);
    scopeItem.iconPath = isWorkspace
      ? new vscode.ThemeIcon('folder', new vscode.ThemeColor('charts.blue'))
      : new vscode.ThemeIcon('globe', new vscode.ThemeColor('charts.green'));
    scopeItem.description = isWorkspace
      ? `this workspace \u2192 ${active.alias}`
      : 'applies to all projects';
    scopeItem.tooltip = isWorkspace
      ? 'Click to switch to global scope (remove project override)'
      : `Click to pin "${active.alias}" to this project`;
    scopeItem.contextValue = 'infoField-scope';
    scopeItem.command = {
      command: 'llmessage.toggleProfileScope',
      title: 'Toggle Scope',
    };
    items.push(scopeItem);

    // Edit in settings.json
    const jsonItem = new vscode.TreeItem('Edit in settings.json');
    jsonItem.iconPath = new vscode.ThemeIcon('json');
    jsonItem.description = 'Manual edit';
    jsonItem.tooltip = 'Open settings.json to edit this profile manually';
    jsonItem.command = {
      command: 'llmessage.openSettingsJson',
      title: 'Open Settings JSON',
    };
    items.push(jsonItem);

    const providerItem = new vscode.TreeItem(`Provider: ${getProviderLabel(p.provider)}`);
    providerItem.iconPath = new vscode.ThemeIcon('cloud');
    providerItem.contextValue = 'infoField-provider';
    providerItem.command = {
      command: 'llmessage.editActiveProfileField',
      title: 'Edit Provider',
      arguments: ['provider'],
    };
    items.push(providerItem);

    const modelItem = new vscode.TreeItem(`Model: ${p.model || 'default'}`);
    modelItem.iconPath = new vscode.ThemeIcon('symbol-method');
    modelItem.contextValue = 'infoField-model';
    modelItem.command = {
      command: 'llmessage.editActiveProfileField',
      title: 'Edit Model',
      arguments: ['model'],
    };
    items.push(modelItem);

    if (requiresApiKey(p.provider)) {
      const apiKeyItem = new vscode.TreeItem('API Key: ••••••••');
      apiKeyItem.iconPath = new vscode.ThemeIcon('key');
      apiKeyItem.contextValue = 'infoField-apikey';
      apiKeyItem.command = {
        command: 'llmessage.editActiveProfileField',
        title: 'Edit API Key',
        arguments: ['apikey'],
      };
      items.push(apiKeyItem);
    }

    const styleItem = new vscode.TreeItem(`Style: ${getCommitStyleLabel(p.commitStyle)}`);
    styleItem.iconPath = new vscode.ThemeIcon('edit');
    styleItem.contextValue = 'infoField-commitStyle';
    styleItem.command = {
      command: 'llmessage.editActiveProfileField',
      title: 'Edit Commit Style',
      arguments: ['commitStyle'],
    };
    if (p.commitStyle === 'custom') {
      styleItem.description = p.customPrompt
        ? `${p.customPrompt.substring(0, 40).replace(/\n/g, ' ')}…`
        : '(no prompt set)';
      styleItem.tooltip = p.customPrompt || 'Click to view/edit custom prompt';
    }
    items.push(styleItem);

    const localeItem = new vscode.TreeItem(`Locale: ${p.locale}`);
    localeItem.iconPath = new vscode.ThemeIcon('globe');
    localeItem.contextValue = 'infoField-locale';
    localeItem.command = {
      command: 'llmessage.editActiveProfileField',
      title: 'Edit Locale',
      arguments: ['locale'],
    };
    items.push(localeItem);

    return items;
  }
}
