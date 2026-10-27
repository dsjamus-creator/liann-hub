#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
node --version
npm --version
git --version
git -C "$repo_dir" status -sb
test -x "${CHROME_PATH:-/opt/pw-browsers/chromium}" && echo "Chromium: ${CHROME_PATH:-/opt/pw-browsers/chromium}"
codex --version
claude --version
