import * as vscode from 'vscode';
import { CommitStyle, getActiveProfile, migrateProfile } from '../config/settings';
import { TEMPLATES } from './templates';

export interface PromptOptions {
  commitStyle: CommitStyle;
  customPrompt: string;
  locale: string;
}

/**
 * System-level prompt that always wraps the user's prompt.
 * Enforces clean output format regardless of user's custom prompt.
 */
const SYSTEM_RULES = `[SYSTEM RULES — absolute, immutable]
- You are a commit message generator.
- Output ONLY the raw commit message text. Nothing else.
- NO markdown code blocks, NO backtick fences, NO labels like "Commit message:".
- Keep it concise. Each bullet point should be ONE short line, not a paragraph.
- Do NOT write long explanations or essays. Be terse and direct.
- Follow the user's format instructions below.

`;

/**
 * Build the full prompt to send to the AI provider.
 * Reads custom prompt from profile settings in settings.json.
 */
export function buildPrompt(diff: string, overrides?: Partial<PromptOptions>): string {
  const profile = getActiveProfile();
  const migrated = profile ? migrateProfile(profile) : { commitStyle: 'conventional' as CommitStyle, customPrompt: '', locale: 'en' };

  const style = overrides?.commitStyle ?? migrated.commitStyle;
  const locale = overrides?.locale ?? migrated.locale ?? vscode.env.language ?? 'en';

  const customPrompt = overrides?.customPrompt ?? migrated.customPrompt;

  let template: string;

  if (style === 'custom') {
    template = customPrompt;
    if (!template) {
      throw new Error(
        'Custom commit style selected but no custom prompt configured. ' +
        'Edit the profile to set a custom prompt.'
      );
    }
  } else {
    template = TEMPLATES[style];
  }

  // Replace placeholders
  const userPrompt = template
    .replace(/\{\{diff\}\}/g, diff)
    .replace(/\{\{locale\}\}/g, locale);

  // System rules + user prompt
  const finalPrompt = SYSTEM_RULES + userPrompt;
  
  // Debug log: show the actual prompt sent to AI
  console.log('[DEBUG] buildPrompt - Sending prompt to AI:');
  console.log(finalPrompt);
  console.log('[DEBUG] buildPrompt - End of prompt');
  
  return finalPrompt;
}
