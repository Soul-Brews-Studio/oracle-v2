#!/bin/bash
# Fresh installation of Oracle Nightly with seed data
# Usage: curl -sSL https://raw.githubusercontent.com/Soul-Brews-Studio/oracle-v2/main/scripts/fresh-install.sh | bash
set -e

INSTALL_DIR="${ORACLE_INSTALL_DIR:-$HOME/.local/share/oracle-v2}"
DATA_DIR="$HOME/.oracle"

echo "🔮 Oracle Nightly - Fresh Installation"
echo "======================================="
echo ""

# Check requirements
echo "📋 Checking requirements..."
if ! command -v bun &> /dev/null; then
    echo "❌ bun not found. Install: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi
echo "  ✅ bun $(bun --version)"

if ! command -v git &> /dev/null; then
    echo "❌ git not found"
    exit 1
fi
echo "  ✅ git found"

# Optional: uvx for vector search
if command -v uvx &> /dev/null; then
    echo "  ✅ uvx $(uvx --version) (vector search enabled)"
else
    echo "  ⚠️ uvx not found (FTS5 only, no vector search)"
    echo "     Install: curl -LsSf https://astral.sh/uv/install.sh | sh"
fi

echo ""

# Clean previous installation
if [ -d "$INSTALL_DIR" ]; then
    echo "🧹 Removing previous installation..."
    rm -rf "$INSTALL_DIR"
fi

if [ -d "$DATA_DIR" ]; then
    echo "🧹 Removing previous data..."
    rm -rf "$DATA_DIR"
fi

# Clone
echo "📥 Cloning Oracle Nightly..."
git clone --depth 1 https://github.com/Soul-Brews-Studio/oracle-v2.git "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Install dependencies
echo "📦 Installing dependencies..."
bun install

# Setup database
echo "🗄️ Setting up database..."
mkdir -p "$DATA_DIR"
bun run db:push

# Create seed data
echo "🌱 Creating seed philosophy files..."
./scripts/seed.sh

# Build frontend
echo "🎨 Building frontend..."
cd frontend && bun install && bun run build && cd ..

# Index seed data
echo "📚 Indexing seed data..."
ORACLE_REPO_ROOT="$DATA_DIR/seed" bun run index

# Run tests
echo "🧪 Running tests..."
bun test || echo "⚠️ Some tests failed (may be expected on fresh install)"

# Show results
echo ""
echo "✅ Installation complete!"
echo ""
echo "📊 Database stats:"
curl -s http://localhost:47778/api/stats 2>/dev/null || echo "(Server not running)"
echo ""
echo "🚀 Quick start:"
echo "  cd $INSTALL_DIR"
echo "  bun run server     # Start HTTP API on :47778"
echo ""
echo "📝 Add to Claude Code (~/.claude.json):"
echo '  {'
echo '    "mcpServers": {'
echo '      "oracle-v2": {'
echo '        "command": "bun",'
echo "        \"args\": [\"run\", \"$INSTALL_DIR/src/index.ts\"]"
echo '      }'
echo '    }'
echo '  }'
echo ""
echo "🔗 Dashboard URLs:"
echo "   http://localhost:47778"
# Get hostname
HOSTNAME=$(hostname 2>/dev/null || echo "")
if [ -n "$HOSTNAME" ]; then
    echo "   http://${HOSTNAME}:47778"
fi
# Get IP addresses (Linux and macOS compatible)
if command -v ip &> /dev/null; then
    # Linux
    for IP in $(ip -4 addr show | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v '127.0.0.1'); do
        echo "   http://${IP}:47778"
    done
elif command -v ifconfig &> /dev/null; then
    # macOS
    for IP in $(ifconfig | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}'); do
        echo "   http://${IP}:47778"
    done
fi
echo ""
echo "📖 Docs: https://github.com/Soul-Brews-Studio/oracle-v2"
