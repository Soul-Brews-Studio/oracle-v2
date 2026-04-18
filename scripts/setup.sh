#!/bin/bash
# Setup arra-oracle-v3
# Note: frontend/ was archived to the oracle vault on 2026-04-19 — UI now lives in Soul-Brews-Studio/oracle-studio.
set -e

echo "🔧 Installing root dependencies..."
bun install

echo "🗄️ Setting up database..."
mkdir -p ~/.oracle
bun run db:push  # Creates/updates tables from schema

echo "🔨 Typechecking..."
bun run build

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  bun run server     # Start HTTP server"
echo "  bun test           # Run tests"
echo ""
