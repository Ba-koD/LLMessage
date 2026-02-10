import * as vscode from 'vscode';

/**
 * Collect the staged diff from the current Git repository.
 * Falls back to unstaged diff if nothing is staged.
 */
export async function getStagedDiff(maxLength: number): Promise<string> {
  const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
  if (!gitExtension) {
    throw new Error('Git extension not found. Make sure the built-in Git extension is enabled.');
  }

  const git = gitExtension.getAPI(1);
  if (!git) {
    throw new Error('Git API not available.');
  }

  const repo = git.repositories[0];
  if (!repo) {
    throw new Error('No Git repository found in the current workspace.');
  }

  // Try staged changes first
  let diff = await repo.diff(true); // staged

  // Fallback to unstaged if nothing staged
  if (!diff || diff.trim().length === 0) {
    diff = await repo.diff(false); // unstaged
    if (!diff || diff.trim().length === 0) {
      throw new Error('No changes detected. Stage some changes first.');
    }
  }

  // Truncate if too long
  if (diff.length > maxLength) {
    diff = diff.substring(0, maxLength) + '\n\n... (diff truncated)';
  }

  return diff;
}

/**
 * Set the commit message in the SCM input box.
 */
export function setCommitMessage(message: string): void {
  const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
  if (!gitExtension) {
    return;
  }

  const git = gitExtension.getAPI(1);
  const repo = git?.repositories[0];
  if (repo) {
    repo.inputBox.value = message;
  }
}
