import * as vscode from 'vscode';
import { SecretManager } from '../config/secrets';
import { createProvider } from '../providers/factory';
import { getStagedDiff, setCommitMessage } from '../git/diff';
import { buildPrompt } from '../prompt/builder';
import { ProviderType } from '../config/settings';

const TIMEOUT_MS = 60_000;

const RATE_LIMIT_URLS: Partial<Record<ProviderType, string>> = {
  gemini: 'https://aistudio.google.com/app/rate-limit',
  openai: 'https://platform.openai.com/settings/organization/limits',
  anthropic: 'https://console.anthropic.com/settings/limits',
};

/**
 * Main command: generate a commit message from staged changes.
 */
export function registerGenerateCommitCommand(
  context: vscode.ExtensionContext,
  secretManager: SecretManager,
): vscode.Disposable {
  const version = String(context.extension.packageJSON.version ?? 'unknown');
  const prefix = `v${version} LLMessage:`;

  return vscode.commands.registerCommand('llmessage.generateCommit', async (sourceControl?: { rootUri?: vscode.Uri }) => {
    let providerName = '';
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'LLMessage',
          cancellable: true,
        },
        async (progress, token) => {
          progress.report({ message: 'Collecting git diff...' });
          const { diff, repo } = await getStagedDiff(sourceControl?.rootUri);

          if (token.isCancellationRequested) return;

          progress.report({ message: 'Building prompt...' });
          const prompt = buildPrompt(diff);

          progress.report({ message: 'Generating commit message...' });
          const { provider, modelOverride, profileAlias } = await createProvider(secretManager);
          providerName = provider.name;

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

            await setCommitMessage(result.message, repo);
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
      const err = error as Error & { statusCode?: number };
      if (err.statusCode === 429) {
        const nameToProvider: Record<string, ProviderType> = {
          'OpenAI': 'openai', 'Anthropic': 'anthropic', 'Google Gemini': 'gemini',
        };
        const rateLimitUrl = RATE_LIMIT_URLS[nameToProvider[providerName]];
        const buttons = rateLimitUrl ? ['View Rate Limits'] : [];
        const action = await vscode.window.showErrorMessage(
          `${prefix} Rate limit exceeded (429). Check your API usage.`,
          ...buttons,
        );
        if (action === 'View Rate Limits' && rateLimitUrl) {
          vscode.env.openExternal(vscode.Uri.parse(rateLimitUrl));
        }
      } else {
        vscode.window.showErrorMessage(`${prefix} ${err.message ?? 'Unknown error'}`);
      }
    }
  });
}
