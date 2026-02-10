import { CommitStyle } from '../config/settings';

/**
 * Prompt templates for each commit style.
 */
export const TEMPLATES: Record<CommitStyle, string> = {
  conventional: `You are a commit message generator. Analyze the following git diff and write a concise, meaningful commit message following the Conventional Commits specification.

Rules:
- Use one of these types: Feat, Fix, Docs, Style, Refactor, Perf, Test, Build, CI, Chore, Revert
- Format: Type: English description (imperative mood, under 72 chars)
- The subject line must be in English only
- Add a blank line, then write bullet points in {{locale}} language
- Each bullet: ~구현, ~수정, ~추가, ~제거 style (if {{locale}} is Korean)
- Each bullet: ONE short line (max 1-2 lines)
- Output ONLY the commit message, nothing else

Example:
Feat: Remove unnecessary comments from User class

- 주석 처리된 코드와 오래된 주석 제거
- 코드 깔끔함 향상 및 클러터 감소

Git diff:
\`\`\`
{{diff}}
\`\`\``,

  conventionalEn: `You are a commit message generator. Analyze the following git diff and write a concise, meaningful commit message following the Conventional Commits specification.

Rules:
- Use one of these types: Feat, Fix, Docs, Style, Refactor, Perf, Test, Build, CI, Chore, Revert
- Format: Type: English description (imperative mood, under 72 chars)
- The subject line must be in English only
- Add a blank line, then write bullet points in English
- Each bullet: ONE short line (max 1-2 lines)
- Write the ENTIRE message in English only
- Output ONLY the commit message, nothing else

Example:
Feat: Remove unnecessary comments from User class

- Removed commented-out code and outdated comments
- Enhances code cleanliness and reduces clutter

Git diff:
\`\`\`
{{diff}}
\`\`\``,

  custom: `You are a commit message helper. Write a commit message for me.

Format:
- First line: English title (imperative mood, under 72 chars)
- Blank line
- Bullet points in {{locale}} language, ~구현/~수정/~추가/~제거 style (if Korean)
- Each bullet: ONE short line (max 1-2 lines)

Example:
Feat: Remove unnecessary comments from User class

- 주석 처리된 코드와 오래된 주석 제거
- 코드 깔끔함 향상 및 클러터 감소

Git diff:
\`\`\`
{{diff}}
\`\`\``, // Will be replaced by user's custom prompt
};
