# GNOME Stocks - GNOME Shell Extension

A GNOME 49 extension for tracking stock market prices with search, watchlist, panel display, and desktop widgets.

![GNOME Stocks Demo](GNOME%20Stocks.gif)

## Features

- 🔍 **Stock Search**: Search for stocks by name or symbol (stocks, crypto, forex)
- 📋 **Watchlist**: Add stocks to your personal watchlist with real-time prices
- 📊 **Panel Display**: Show selected stocks with logos, prices, and change indicators directly in the top bar
- 🖥️ **Desktop Widgets**: Pin stocks as floating widgets on your desktop with interactive charts
- 📈 **Interactive Charts**: Click panel stocks to view detailed price charts with multiple timeframes (1D, 5D, 1M, 6M, 1Y, 5Y)
- 🖼️ **Stock Logos**: Automatic company logo fetching and caching
- 🔄 **Auto-Refresh**: Automatic price updates (configurable interval)
- 💹 **Price Changes**: Visual indicators for positive/negative changes
- 🎨 **Customizable**: Adjust panel position, widget size, opacity, and more

## Installation

### Manual Installation

1. Clone or download this repository
2. Run the installation script:
   ```bash
   ./install.sh
   ```
3. Restart GNOME Shell:
   - **X11**: Press `Alt+F2`, type `r`, and press Enter
   - **Wayland**: Log out and log back in
4. Enable the extension:
   ```bash
   gnome-extensions enable gnome-stocks@perpuchaty.github.com
   ```
   Or use the GNOME Extensions app.

### From Extensions Website (Future)

The extension may be available on [extensions.gnome.org](https://extensions.gnome.org) in the future.

## Usage

### Search for Stocks
1. Click on the "GNOME Stocks" indicator in the top bar
2. Type a stock symbol or company name in the search box
3. Click the **star icon** (⭐) to add to watchlist

### Manage Watchlist
- Click the **eye icon** (👁) next to a stock to show/hide it in the panel bar
- Click the **pin icon** (📌) to add/remove desktop widget
- Click the **trash icon** (🗑) to remove from watchlist
- Click "Refresh Now" to manually update prices

### Panel Display
Stocks shown in the panel display:
- Company logo
- Stock symbol
- Current price
- Change indicator (▲ green for up, ▼ red for down) with percentage
- **Click any panel stock** to open an interactive chart popup

### Desktop Widgets
Desktop widgets provide persistent, at-a-glance stock information:
- **Pin/Unpin**: Click the pin icon in the watchlist to add/remove desktop widgets
- **Move Widgets**: Click "Arrange Widgets" button to enter move mode, drag widgets to reposition, click again to save positions
- **Interactive Charts**: Widgets display live price charts with multiple timeframe options (1D, 5D, 1M, 6M, 1Y, 5Y)
- **Draggable**: Widgets can be moved anywhere on your desktop
- **Customizable**: Adjust opacity, scale, and chart visibility in preferences

## Configuration

Access preferences via the extension menu or run:
```bash
gnome-extensions prefs gnome-stocks@perpuchaty.github.com
```

### Available Settings

**Appearance**
- **Panel Position**: Choose where the indicator appears (Left, Center, Right)
- **Show Icon**: Toggle main indicator icon visibility
- **Show Stock Elements**: Control visibility of icons, prices, names, and gains in panel buttons
- **Font Size**: Adjust popup menu font size (8-24px)

**Desktop Widgets**
- **Opacity**: Control widget transparency (0-100%)
- **Scale**: Adjust widget size (0.5x - 2.0x)
- **Show Charts**: Toggle chart display in widgets

**Updates**
- **Refresh Interval**: How often to update prices (default: 60 seconds, minimum: 30 seconds)

## Data Source

- **Stock Data**: Yahoo Finance API (no API key required)
- **Chart Data**: Historical price data with multiple timeframes
- **Company Logos**: Clearbit Logo API with local caching
- **Supported Assets**: Stocks, cryptocurrencies, forex, and major indices

## File Structure

```
gnome-stocks@perpuchaty.github.com/
├── extension.js        # Main extension entry point
├── stockPopupMenu.js   # UI components and menu
├── stockApi.js         # Yahoo Finance API integration
├── logoCache.js        # Logo caching system
├── metadata.json       # Extension metadata
├── stylesheet.css      # Custom styles
├── schemas/            # GSettings schema
├── install.sh          # Installation script
├── uninstall.sh        # Uninstallation script
└── README.md           # This file
```

## Requirements

- GNOME Shell 49
- libsoup3 (for HTTP requests)

## Uninstallation

Run the uninstallation script:
```bash
./uninstall.sh
```

Or manually:
```bash
gnome-extensions disable gnome-stocks@perpuchaty.github.com
rm -rf ~/.local/share/gnome-shell/extensions/gnome-stocks@perpuchaty.github.com
rm -rf ~/.cache/gnome-stocks-logos
```

## License

MIT License

## Contributing

Contributions are welcome! Feel free to submit issues and pull requests.

## Disclaimer

This extension is for informational purposes only. Stock data may be delayed. Do not use for trading decisions.

## Donation

https://buymeacoffee.com/perpuchaty