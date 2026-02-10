import * as vscode from 'vscode';
import { getConfig } from '../config/settings';
import { SecretManager } from '../config/secrets';
import { createProvider } from '../providers/factory';
import { getStagedDiff, setCommitMessage } from '../git/diff';
import { buildPrompt } from '../prompt/builder';

const TIMEOUT_MS = 60_000;

/**
 * Main command: generate a commit message from staged changes.
 */
export function registerGenerateCommitCommand(
  context: vscode.ExtensionContext,
  secretManager: SecretManager,
): vscode.Disposable {
  return vscode.commands.registerCommand('llmessage.generateCommit', async () => {
    try {
      const config = getConfig();

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'LLMessage',
          cancellable: true,
        },
        async (progress, token) => {
          progress.report({ message: 'Collecting git diff...' });
          const diff = await getStagedDiff(config.maxDiffLength);

          if (token.isCancellationRequested) return;

          progress.report({ message: 'Building prompt...' });
          const prompt = buildPrompt(diff);

          progress.report({ message: 'Generating commit message...' });
          const { provider, modelOverride, profileAlias } = await createProvider(secretManager);

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
          const cancelListener = token.onCancellationRequested(() => controller.abort());

          try {
            const result = await provider.generateMessage(prompt, modelOverride, controller.signal);

            if (token.isCancellationRequested || !result.message) {
              if (!result.message) {
                vscode.window.showWarningMessage('LLMessage: AI returned an empty message.');
              }
              return;
            }

            setCommitMessage(result.message);
            vscode.window.showInformationMessage(`LLMessage: [${profileAlias}] ${result.model}`);
          } catch (err: unknown) {
            const error = err as { name?: string; message?: string };
            if (error.name === 'AbortError') {
              if (token.isCancellationRequested) {
                vscode.window.showInformationMessage('LLMessage: Cancelled.');
              } else {
                vscode.window.showErrorMessage(`LLMessage: Request timed out (${TIMEOUT_MS}ms). Try a faster model or shorter diff.`);
              }
              return;
            }
            throw err;
          } finally {
            clearTimeout(timeoutId);
            cancelListener.dispose();
          }
        },
      );
    } catch (error: unknown) {
      const err = error as Error;
      vscode.window.showErrorMessage(`LLMessage: ${err.message ?? 'Unknown error'}`);
    }
  });
}
