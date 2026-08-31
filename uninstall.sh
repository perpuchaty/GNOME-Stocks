#!/bin/bash

EXTENSION_UUID="gnome-stocks@perpuchaty.github.com"
EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"

echo "Uninstalling GNOME Stocks GNOME Extension..."

gnome-extensions disable "$EXTENSION_UUID" 2>/dev/null

if [ -d "$EXTENSION_DIR" ]; then
    rm -rf "$EXTENSION_DIR"
    echo "Extension removed from: $EXTENSION_DIR"
else
    echo "Extension not found at: $EXTENSION_DIR"
fi

CACHE_DIR="$HOME/.cache/gnome-stocks-logos"
if [ -d "$CACHE_DIR" ]; then
    rm -rf "$CACHE_DIR"
    echo "Cache cleared: $CACHE_DIR"
fi

echo "Uninstallation complete!"
