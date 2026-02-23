import * as vscode from 'vscode';
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
  const version = String(context.extension.packageJSON.version ?? 'unknown');
  const prefix = `v${version} LLMessage:`;

  return vscode.commands.registerCommand('llmessage.generateCommit', async () => {
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'LLMessage',
          cancellable: true,
        },
        async (progress, token) => {
          progress.report({ message: 'Collecting git diff...' });
          const diff = await getStagedDiff();

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
                vscode.window.showWarningMessage(`${prefix} AI returned an empty message.`);
              }
              return;
            }

            setCommitMessage(result.message);
            if (result.truncated) {
              vscode.window.showWarningMessage(
                `${prefix} [${profileAlias}] ${result.model} response was truncated. ` +
                'Try a shorter diff or reduce output verbosity in your prompt.',
              );
            } else {
              vscode.window.showInformationMessage(`${prefix} [${profileAlias}] ${result.model}`);
            }
          } catch (err: unknown) {
            const error = err as { name?: string; message?: string };
            if (error.name === 'AbortError') {
              if (token.isCancellationRequested) {
                vscode.window.showInformationMessage(`${prefix} Cancelled.`);
              } else {
                vscode.window.showErrorMessage(`${prefix} Request timed out (${TIMEOUT_MS}ms). Try a faster model or shorter diff.`);
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
      vscode.window.showErrorMessage(`${prefix} ${err.message ?? 'Unknown error'}`);
    }
  });
}
