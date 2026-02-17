#!/bin/bash
# Oracle v2 Startup Script
# Sets up environment for portable project

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export ORACLE_DB_PATH="$SCRIPT_DIR/.oracle-v2/oracle.db"
export ORACLE_DATA_DIR="$SCRIPT_DIR/.oracle-v2"

echo "Oracle v2 starting with:"
echo "  DB: $ORACLE_DB_PATH"
echo "  Data: $ORACLE_DATA_DIR"

bun run "$@"
