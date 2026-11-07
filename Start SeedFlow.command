#!/bin/bash
# Double-click to install (first time only) and start SeedFlow, then open it in your browser.
cd "$(dirname "$0")"
echo "🌱 Starting SeedFlow…"

# Load nvm if it's installed, so the right Node version is used.
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
[ -s "/opt/homebrew/bin/brew" ] && eval "$(/opt/homebrew/bin/brew shellenv)"

need_node() {
  ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]
}
if need_node; then
  if command -v nvm >/dev/null 2>&1; then
    echo "Installing Node 22 with nvm…"
    nvm install 22 && nvm use 22
  fi
fi
if need_node; then
  echo ""
  echo "❌ SeedFlow needs Node.js 20 or newer. Install it from https://nodejs.org (LTS), then double-click this file again."
  read -r -p "Press Enter to close…"
  exit 1
fi
echo "Using Node $(node -v)"

if [ ! -d node_modules ]; then
  echo "Installing packages (first run only, ~1 minute)…"
  npm install || { read -r -p "npm install failed. Press Enter to close…"; exit 1; }
fi

# Create or update the local database. Nothing here touches the live site.
npx cf d1 migrations apply 94072807-2577-41ea-b804-8ca9b20210ee --local --persist-to .cloudflare/state >/dev/null || { read -r -p "Database setup failed. Press Enter to close…"; exit 1; }

# Open the browser once the server is up.
( for i in {1..60}; do curl -s -o /dev/null http://localhost:3001 && open http://localhost:3001 && exit; sleep 1; done ) &

echo ""
echo "SeedFlow is running at http://localhost:3001  — keep this window open. Press Ctrl+C to stop."
npm run dev
