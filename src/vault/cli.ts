/**
 * Oracle Vault CLI
 *
 * Usage:
 *   bun run vault:init Soul-Brews-Studio/oracle-vault
 *   bun run vault:sync [--dry-run]
 *   bun run vault:status
 */

import { initVault, syncVault, vaultStatus } from './handler.js';

const repoRoot = process.env.ORACLE_REPO_ROOT || process.cwd();
const [, , command, ...args] = process.argv;

switch (command) {
  case 'init': {
    const repo = args[0];
    if (!repo) {
      console.error('Usage: bun run vault:init <owner/repo>');
      process.exit(1);
    }
    const result = initVault(repo);
    console.log(JSON.stringify(result, null, 2));
    break;
  }

  case 'sync': {
    const dryRun = args.includes('--dry-run');
    const result = syncVault({ dryRun, repoRoot });
    console.log(JSON.stringify(result, null, 2));
    break;
  }

  case 'status': {
    const result = vaultStatus(repoRoot);
    console.log(JSON.stringify(result, null, 2));
    break;
  }

  default:
    console.error('Usage: bun run vault:{init|sync|status}');
    process.exit(1);
}
