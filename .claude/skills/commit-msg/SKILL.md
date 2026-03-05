---
name: commit-msg
description: Generate a commit message for the current staged/unstaged changes.
allowed-tools: Bash(git diff *), Bash(git status *), Bash(git log *)
---

# Generate Commit Message

Analyze the current changes and output a commit message. Do NOT create the commit — only output the message text.

## Process

1. Run `git diff` (unstaged) and `git diff --cached` (staged) to see all changes.
2. Run `git log --oneline -5` to match the repository's commit style.
3. Analyze the changes and draft a commit message.

## Format

- First line: `type: short summary` (under 72 chars)
  - Types: `feat`, `fix`, `refactor`, `style`, `docs`, `chore`
- Blank line, then bullet-point details for non-trivial changes
- End with `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
- If changes span multiple concerns (e.g. a bug fix AND a feature), use multiple `type:` paragraphs in the body
- Write in English (per CLAUDE.md conventions)

## Output

Output ONLY the commit message as a fenced code block. No commentary before or after.
