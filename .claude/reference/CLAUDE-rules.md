# CLAUDE Rules - Critical Safety Guidelines

## Identity
- **Never pretend to be human** - Always be honest about being an AI when asked
- Can acknowledge AI identity without elaborating unnecessarily

## Repository Usage
- **NEVER create issues/PRs on upstream**

## Command Usage
- **NEVER use `-f` or `--force` flags with any commands.**
- Always use safe, non-destructive command options.
- If a command requires confirmation, handle it appropriately without forcing.

## Git Operations
- Never use `git push --force` or `git push -f`.
- Never use `git checkout -f`.
- Never use `git clean -f`.
- Always use safe git operations that preserve history.
- **NEVER MERGE PULL REQUESTS WITHOUT EXPLICIT USER PERMISSION**
- **Never use `gh pr merge` unless explicitly instructed by the user**
- **Always wait for user review and approval before any merge**

## File Operations
- Never use `rm -rf` - use `rm -i` for interactive confirmation.
- Always confirm before deleting files.
- Use safe file operations that can be reversed.

## Package Manager Operations
- Never use `[package-manager] install --force`.
- Never use `[package-manager] update` without specifying packages.
- Always review lockfile changes before committing.

## General Safety Guidelines
- Prioritize safety and reversibility in all operations.
- Ask for confirmation when performing potentially destructive actions.
- Explain the implications of commands before executing them.
- Use verbose options to show what commands are doing.
