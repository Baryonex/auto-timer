#!/usr/bin/env bash
set -euo pipefail

UUID="auto-timer@local"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"

mkdir -p "$HOME/.local/share/gnome-shell/extensions"
ln -sfn "$SRC_DIR" "$DEST_DIR"
gnome-extensions enable "$UUID" || true

echo "Installed and enabled $UUID"
echo "Log out & back in (Wayland), or press Alt+F2, type 'r', and press Enter (X11)."
