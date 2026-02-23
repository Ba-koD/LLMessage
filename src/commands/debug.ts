import * as vscode from 'vscode';
import { getActiveProfile } from '../config/settings';
import { getStagedDiff } from '../git/diff';

/**
 * Command: collect debug info and copy it to clipboard.
 */
export function registerDebugCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand('llmessage.debug', async () => {
    const version = String(context.extension.packageJSON.version ?? 'unknown');
    const active = getActiveProfile();

    let diffState = 'unavailable';
    try {
      const diff = await getStagedDiff();
      diffState = `${diff.length} chars`;
    } catch (error: unknown) {
      const err = error as Error;
      diffState = `unavailable (${err.message ?? 'unknown error'})`;
    }

    const lines = [
      `v${version}`,
      `activeProfile=${active?.alias ?? '(none)'}`,
      `provider=${active?.provider ?? '(none)'}`,
      `model=${active?.model || '(default)'}`,
      `workspaceFolders=${vscode.workspace.workspaceFolders?.length ?? 0}`,
      `diff=${diffState}`,
    ];

    const debugText = lines.join('\n');
    await vscode.env.clipboard.writeText(debugText);
    console.log(`[LLMessage v${version}] debug info\n${debugText}`);
    vscode.window.showInformationMessage(`v${version} LLMessage: Debug info copied to clipboard.`);
  });
}
