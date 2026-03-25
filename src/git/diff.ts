import * as vscode from 'vscode';

const REPO_WAIT_TIMEOUT_MS = 10_000;

/**
 * Ensure the built-in Git extension is activated and return its API.
 */
async function getGitAPI() {
  const gitExtension = vscode.extensions.getExtension('vscode.git');
  if (!gitExtension) {
    throw new Error('Git extension not found. Make sure the built-in Git extension is enabled.');
  }

  const exports = gitExtension.isActive
    ? gitExtension.exports
    : await gitExtension.activate();

  const git = exports.getAPI(1);
  if (!git) {
    throw new Error('Git API not available.');
  }

  return git;
}

/**
 * Wait for at least one repository to appear if none exist yet.
 */
async function waitForRepositories(git: ReturnType<Awaited<ReturnType<typeof getGitAPI>>['getAPI']>) {
  if (git.repositories.length > 0) {
    return;
  }

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      disposable.dispose();
      reject(new Error('No Git repository found. The workspace may still be loading — please try again.'));
    }, REPO_WAIT_TIMEOUT_MS);

    const disposable = git.onDidOpenRepository(() => {
      clearTimeout(timeout);
      disposable.dispose();
      resolve();
    });
  });
}

/**
 * Find the repository that matches the active editor's file,
 * or fall back to the first repo with staged changes, or the first repo overall.
 */
function pickRepository(git: ReturnType<Awaited<ReturnType<typeof getGitAPI>>['getAPI']>) {
  const repos = git.repositories;
  if (repos.length === 0) {
    throw new Error('No Git repository found in the current workspace.');
  }
  if (repos.length === 1) {
    return repos[0];
  }

  // Try to match the active editor's file to a repo
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri) {
    // Sort repos by rootUri length descending so deepest (most specific) match wins
    const sorted = [...repos].sort(
      (a, b) => b.rootUri.fsPath.length - a.rootUri.fsPath.length,
    );
    for (const repo of sorted) {
      if (activeUri.fsPath.startsWith(repo.rootUri.fsPath)) {
        return repo;
      }
    }
  }

  // Fallback: first repo (VS Code sorts by relevance)
  return repos[0];
}

/**
 * Collect the staged diff from the current Git repository.
 * Falls back to unstaged diff if nothing is staged.
 */
export async function getStagedDiff(): Promise<{ diff: string; repo: unknown }> {
  const git = await getGitAPI();
  await waitForRepositories(git);

  console.log('[LLMessage] repositories:', git.repositories.length,
    git.repositories.map((r: { rootUri: vscode.Uri }) => r.rootUri.fsPath));

  const repo = pickRepository(git);
  console.log('[LLMessage] picked repo:', repo.rootUri.fsPath);

  // Try staged changes first
  let diff = await repo.diff(true);
  console.log('[LLMessage] staged diff length:', diff?.length ?? 0);

  if (!diff || diff.trim().length === 0) {
    diff = await repo.diff(false);
    console.log('[LLMessage] unstaged diff length:', diff?.length ?? 0);
    if (!diff || diff.trim().length === 0) {
      throw new Error('No changes detected. Stage some changes first.');
    }
  }

  return { diff, repo };
}

/**
 * Set the commit message in the SCM input box of the given repo.
 */
export async function setCommitMessage(message: string, repo?: unknown): Promise<void> {
  try {
    const target = repo as { inputBox: { value: string } } | undefined;
    if (target) {
      target.inputBox.value = message;
      return;
    }
    const git = await getGitAPI();
    const fallback = git.repositories[0];
    if (fallback) {
      fallback.inputBox.value = message;
    }
  } catch {
    // Best-effort
  }
}
