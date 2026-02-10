import * as vscode from 'vscode';

const SECRET_PREFIX = 'llmessage.profile.';

function secretKey(alias: string): string {
  return `${SECRET_PREFIX}${alias}`;
}

export class SecretManager {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  /** Get API key for a profile alias */
  async getApiKey(alias: string): Promise<string | undefined> {
    return this.secrets.get(secretKey(alias));
  }

  /** Store API key for a profile alias */
  async setApiKey(alias: string, apiKey: string): Promise<void> {
    await this.secrets.store(secretKey(alias), apiKey);
  }

  /** Remove API key for a profile alias */
  async removeApiKey(alias: string): Promise<void> {
    await this.secrets.delete(secretKey(alias));
  }
}
