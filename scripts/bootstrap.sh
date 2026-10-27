#!/usr/bin/env bash
# Codespaces first-start setup: the hub's packages, Chromium for the smoke test, and the Codex and Claude Code CLIs.
set -euo pipefail
repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$HOME/.local"
export PATH="$HOME/.local/bin:$PATH"
npm config set prefix "$HOME/.local"
npm install -g @openai/codex@0.164.0 @anthropic-ai/claude-code@2.1.310
cd "$repo_dir"
npm ci
# The smoke test launches Chromium from CHROME_PATH (see README). Install the build that matches
# this repo's playwright-core and point CHROME_PATH at it for every new terminal.
npx playwright-core install --with-deps chromium
chrome="$(node -e "import('playwright-core').then(m => console.log(m.chromium.executablePath()))")"
grep -q 'CHROME_PATH=' "$HOME/.bashrc" 2>/dev/null || echo "export CHROME_PATH=\"$chrome\"" >> "$HOME/.bashrc"
echo "Setup done. Open a new terminal, then: npm start (preview on port 4173), npm run check (tests)."
