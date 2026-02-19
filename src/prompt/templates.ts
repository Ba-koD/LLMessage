import { CommitStyle } from '../config/settings';

/**
 * Prompt templates for each commit style.
 */
export const TEMPLATES: Record<CommitStyle, string> = {
  conventional: `You are a commit message generator. Analyze the following git diff and write a commit message in {{locale}} language ONLY.

Rules:
- Use one of these types: Feat, Fix, Docs, Style, Refactor, Perf, Test, Build, CI, Chore, Revert
- Format: Type: {{locale}} description (imperative mood, under 72 chars)
- Write the ENTIRE message (title + bullets) in {{locale}} language
- Group changes by module/directory when multiple files affected
- Include file or function names for significant changes
- Skip trivial changes (whitespace, formatting) unless that's the main change
- Output ONLY the commit message, nothing else

Example (Korean):
Feat: UserService에서 불필요한 주석 제거

- UserService 내 주석 처리된 코드 제거
- 오래된 TODO 주석 정리

Git diff:
\`\`\`
{{diff}}
\`\`\``,

  conventionalEn: `You are a commit message generator. Analyze the following git diff and write a commit message in English ONLY.

Rules:
- Use one of these types: Feat, Fix, Docs, Style, Refactor, Perf, Test, Build, CI, Chore, Revert
- Format: Type: English description (imperative mood, under 72 chars)
- Write the ENTIRE message (title + bullets) in English only
- Group changes by module/directory when multiple files affected
- Include file or function names for significant changes
- Skip trivial changes (whitespace, formatting) unless that's the main change
- Output ONLY the commit message, nothing else

Example:
Feat: Remove unnecessary comments from UserService

- Removed commented-out code from UserService
- Cleaned up outdated TODO comments

Git diff:
\`\`\`
{{diff}}
\`\`\``,

  custom: `You are a commit message helper. Write a commit message for me.

Rules:
- First line: English title with type (Feat/Fix/Refactor/etc), imperative mood, under 72 chars
- Blank line
- Bullet points: Korean only, ~구현/~수정/~추가/~제거 style
- Group changes by module/directory when multiple files affected
- Include file or function names for significant changes
- Skip trivial changes (whitespace, formatting) unless that's the main change

Example:
Feat: Remove unnecessary comments from UserService

- UserService 내 주석 처리된 코드 제거
- 오래된 TODO 주석 정리

Git diff:
\`\`\`
{{diff}}
\`\`\``, // Will be replaced by user's custom prompt
};
