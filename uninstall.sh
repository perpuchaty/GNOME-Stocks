#!/bin/bash

# Uninstall GNOME Stocks GNOME Extension

EXTENSION_UUID="gnome-stocks@perpuchaty.github.com"
EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"

echo "Uninstalling GNOME Stocks GNOME Extension..."

# Disable extension first
gnome-extensions disable "$EXTENSION_UUID" 2>/dev/null

# Remove extension directory
if [ -d "$EXTENSION_DIR" ]; then
    rm -rf "$EXTENSION_DIR"
    echo "Extension removed from: $EXTENSION_DIR"
else
    echo "Extension not found at: $EXTENSION_DIR"
fi

# Clear logo cache
CACHE_DIR="$HOME/.cache/gnome-stocks-logos"
if [ -d "$CACHE_DIR" ]; then
    rm -rf "$CACHE_DIR"
    echo "Cache cleared: $CACHE_DIR"
fi

echo "Uninstallation complete!"
