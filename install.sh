#!/bin/bash

# GNOME Stocks GNOME Extension Installation Script

EXTENSION_UUID="gnome-stocks@sowa"
EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"
SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Installing GNOME Stocks GNOME Extension..."
echo "Source: $SOURCE_DIR"
echo "Target: $EXTENSION_DIR"

# Create extension directory
mkdir -p "$EXTENSION_DIR"

# Copy files
cp "$SOURCE_DIR/extension.js" "$EXTENSION_DIR/"
cp "$SOURCE_DIR/prefs.js" "$EXTENSION_DIR/"
cp "$SOURCE_DIR/stockApi.js" "$EXTENSION_DIR/"
cp "$SOURCE_DIR/stockPopupMenu.js" "$EXTENSION_DIR/"
cp "$SOURCE_DIR/logoCache.js" "$EXTENSION_DIR/"
cp "$SOURCE_DIR/metadata.json" "$EXTENSION_DIR/"
cp "$SOURCE_DIR/stylesheet.css" "$EXTENSION_DIR/"

# Copy schemas
mkdir -p "$EXTENSION_DIR/schemas"
cp "$SOURCE_DIR/schemas/"* "$EXTENSION_DIR/schemas/"

# Compile schemas
glib-compile-schemas "$EXTENSION_DIR/schemas/"

echo ""
echo "Installation complete!"
echo ""
echo "To enable the extension:"
echo "1. Press Alt+F2, type 'r' and press Enter to restart GNOME Shell (X11)"
echo "   OR log out and log back in (Wayland)"
echo "2. Enable the extension using:"
echo "   gnome-extensions enable $EXTENSION_UUID"
echo ""
echo "Or use GNOME Extensions app to enable it."
