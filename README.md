# GNOME Stocks

A GNOME Shell extension for keeping an eye on stocks, cryptocurrencies, and foreign exchange rates from the top bar.

![GNOME Stocks Demo](GNOME%20Stocks.gif)

## Features

- Search by company name or ticker
- Keep a watchlist of stocks, crypto, forex pairs, and major indices
- Put selected tickers directly in the top bar
- Open price charts for 1D, 5D, 1M, 6M, 1Y, and 5Y ranges
- Pin movable stock widgets to the desktop
- Choose which details appear and how often prices refresh

## Installation

1. Clone or download this repository
2. Run the install script:
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

## Usage

### Search and watchlist

1. Click the GNOME Stocks indicator in the top bar
2. Type a stock symbol or company name in the search box
3. Click the star button to add the result to your watchlist

Forex pairs can be entered as a Yahoo Finance symbol such as `USDPLN=X`, or as a pair such as `USD/PLN`.

Use the buttons next to a watchlist item to show it in the panel, pin it to the desktop, or remove it. "Refresh Now" updates prices without waiting for the next scheduled refresh.

### Panel Display
Panel items can show the company logo, ticker, current price, and daily change. Click one to open its chart.

### Desktop Widgets
Pin a watchlist item to add a widget to the desktop. Use "Arrange Widgets" to move pinned widgets, then click it again to save their positions. Widget size, opacity, and chart visibility are available in preferences.

## Configuration

Access preferences via the extension menu or run:
```bash
gnome-extensions prefs gnome-stocks@perpuchaty.github.com
```

Preferences cover panel position and contents, popup font size, chart style, desktop widget appearance, and the refresh interval. You can also give watchlist entries custom display names. Clear a custom name to use the company name returned by Yahoo Finance again.

## Data sources

Quotes and chart data come from Yahoo Finance and do not require an API key. Company logos are fetched from public favicon services and cached locally.

## Project layout

```
extension.js        Main extension entry point
stockPopupMenu.js   Menu, panel button, charts, and desktop widgets
stockApi.js         Yahoo Finance requests and logo lookup
logoCache.js        Local logo cache
prefs.js            Preferences window
schemas/            GSettings schema
```

## Requirements

- GNOME Shell 50 or older
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

Bug reports and pull requests are welcome.

## Disclaimer

This extension is for informational purposes only. Prices may be delayed, so do not rely on it for trading decisions.

## Donation

https://buymeacoffee.com/perpuchaty
