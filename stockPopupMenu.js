import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Cairo from 'gi://cairo';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {StockAPI} from './stockApi.js';
import {LogoCache} from './logoCache.js';

const ICON_SIZE = 16;
const PANEL_ICON_SIZE = 18;
const LABEL_ORDER_NAME_FIRST = 'name-first';

function getFontSizeClass(size) {
    const value = Math.max(5, Math.min(32, Math.round(size)));
    return `stockbar-font-${value}`;
}

function getChangeClass(change) {
    if (change > 0) return 'stockbar-change-positive';
    if (change < 0) return 'stockbar-change-negative';
    return 'stockbar-change-neutral';
}

function getWidgetScaleClass(scale) {
    const value = Math.max(5, Math.min(20, Math.round(scale * 10)));
    return `stockbar-widget-scale-${value}`;
}

function getWidgetOpacityClass(opacity) {
    const clamped = Math.max(10, Math.min(100, Math.round(opacity / 5) * 5));
    return `stockbar-widget-opacity-${clamped}`;
}

function getFxSizeClass(size, isWide) {
    const multiplier = isWide ? 2.0 : 1.5;
    const scaled = Math.round((size * multiplier) / 2) * 2;
    const maxSize = isWide ? 40 : 32;
    const value = Math.max(20, Math.min(maxSize, scaled));
    return `stockbar-fx-size-${value}`;
}

function formatPrice(value, useSeparators) {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return '--';
    }
    const fixed = Number(value).toFixed(2);
    if (!useSeparators) {
        return fixed;
    }
    const [whole, fraction] = fixed.split('.');
    const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${withCommas}.${fraction}`;
}

function getCurrencySymbol(currency) {
    const map = {
        USD: '$',
        EUR: '€',
        GBP: '£',
        JPY: '¥',
        CHF: 'CHF',
        CAD: 'C$',
        AUD: 'A$',
        NZD: 'NZ$',
        SEK: 'SEK',
        NOK: 'NOK',
        DKK: 'DKK',
        PLN: 'zł',
        CZK: 'Kč',
        HUF: 'Ft',
        TRY: '₺',
        MXN: 'MX$',
        BRL: 'R$',
        ZAR: 'R',
        INR: '₹',
        CNY: '¥',
        HKD: 'HK$',
        SGD: 'S$',
    };
    return map[currency] || currency || '$';
}

function formatCurrency(value, currency, useSeparators) {
    const symbol = getCurrencySymbol(currency);
    const formatted = formatPrice(value, useSeparators);
    if (formatted === '--') {
        return formatted;
    }
    if (symbol.length > 1 && !symbol.endsWith('$')) {
        return `${formatted} ${symbol}`;
    }
    return `${symbol}${formatted}`;
}

function isFxSymbol(symbol, data) {
    const upperSymbol = (symbol || '').toUpperCase();
    if (upperSymbol.endsWith('=X')) {
        return true;
    }
    if (data?.type === 'FX' || data?.exchange === 'FX') {
        return true;
    }
    return false;
}

function getFxBaseCurrency(symbol, data) {
    const upperSymbol = (symbol || '').toUpperCase();
    if (upperSymbol.endsWith('=X')) {
        const pair = upperSymbol.replace('=X', '');
        if (pair.length >= 3) {
            return pair.slice(0, 3);
        }
    }
    const display = (data?.displaySymbol || data?.symbol || '').toUpperCase();
    if (display.includes('/')) {
        return display.split('/')[0];
    }
    return upperSymbol.slice(0, 3);
}

function getFxLabelText(symbol, data) {
    const base = getFxBaseCurrency(symbol, data);
    const symbolText = getCurrencySymbol(base);
    if (symbolText && (symbolText.length === 1 || symbolText.endsWith('$'))) {
        return symbolText;
    }
    return base || 'FX';
}

function createFxLabel(symbol, data, size) {
    const labelText = getFxLabelText(symbol, data);
    const isWide = labelText.length > 1;
    const text = new St.Label({
        text: labelText,
        style_class: `stockbar-fx-label-text ${getFontSizeClass(Math.round(size * (isWide ? 0.7 : 0.8)))}`
    });
    text.set_x_align(Clutter.ActorAlign.CENTER);
    text.set_y_align(Clutter.ActorAlign.CENTER);

    const container = new St.Bin({
        style_class: `stockbar-fx-label ${getFxSizeClass(size, isWide)}${isWide ? ' stockbar-fx-label-wide' : ''}`,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER
    });

    container.set_child(text);
    return container;
}

function getCustomNamesMap(settings) {
    try {
        return JSON.parse(settings.get_string('custom-stock-names') || '{}');
    } catch (e) {
        console.debug(`GNOME Stocks: Error parsing custom stock names: ${e.message}`);
        return {};
    }
}

function getCustomName(settings, symbol, fallbackName) {
    const customNames = getCustomNamesMap(settings);
    return customNames[symbol] || fallbackName;
}

// Shared data store for stock quotes
const SharedData = {
    watchlistData: new Map(),
    api: null,
    logoCache: null,
    listeners: new Set(),
    
    init() {
        if (!this.api) {
            this.api = new StockAPI();
            this.logoCache = new LogoCache();
        }
    },
    
    addListener(callback) {
        this.listeners.add(callback);
    },
    
    removeListener(callback) {
        this.listeners.delete(callback);
    },
    
    notifyListeners() {
        for (const callback of this.listeners) {
            try {
                callback();
            } catch (e) {
                console.debug(`GNOME Stocks: Listener error: ${e.message}`);
            }
        }
    },
    
    setQuote(symbol, quote) {
        this.watchlistData.set(symbol, quote);
        this.notifyListeners();
    },
    
    getQuote(symbol) {
        return this.watchlistData.get(symbol);
    },
    
    destroy() {
        if (this.api) {
            this.api.destroy();
            this.api = null;
        }
        if (this.logoCache) {
            this.logoCache.destroy();
            this.logoCache = null;
        }
        this.watchlistData.clear();
        this.listeners.clear();
    }
};

export const StockPopupMenu = GObject.registerClass(
class StockPopupMenu extends PanelMenu.Button {
    _init(settings, extensionPath) {
        super._init(0.0, 'GNOME Stocks');
        
        this._settings = settings;
        this._extensionPath = extensionPath;
        
        // Initialize shared data
        SharedData.init();
        this._api = SharedData.api;
        this._logoCache = SharedData.logoCache;
        this._watchlistData = SharedData.watchlistData;
        
        this._refreshTimeout = null;
        this._searchTimeout = null;
        
        // Initialize font sizes from settings
        this._fontSize = this._settings.get_int('font-size');
        this._smallFontSize = Math.max(8, this._fontSize - 2);
        
        // Panel button with icon only (stocks shown separately)
        this._panelBox = new St.BoxLayout({
            style_class: 'panel-status-menu-box'
        });
        
        this._panelIcon = new St.Icon({
            icon_name: 'power-statistics-symbolic',
            style_class: 'system-status-icon'
        });
        
        this._panelBox.add_child(this._panelIcon);
        this.add_child(this._panelBox);
        
        // Build menu
        this._buildMenu();
        
        // Connect settings changes
        this._settings.connectObject(
            'changed', (settings, key) => {
                if (key === 'watchlist' || key === 'panel-stocks' || key === 'custom-stock-names' || key === 'watchlist-label-order' || key === 'watchlist-show-secondary-label') {
                    this._loadWatchlist();
                } else if (key === 'format-large-prices') {
                    this._updateWatchlistUI();
                }
            },
            this
        );
        
        // Initial load
        this._loadWatchlist();
        this._startRefreshTimer();
    }

    _buildMenu() {
        // Main container with fixed width
        this._mainContainer = new St.BoxLayout({
            vertical: true,
            style_class: 'stockbar-popup-menu'
        });
        
        // Search section
        const searchContainer = new St.BoxLayout({
            style_class: 'stockbar-search-container'
        });
        
        this._searchEntry = new St.Entry({
            hint_text: 'Search stocks...',
            track_hover: true,
            can_focus: true,
            style_class: 'stockbar-search-entry',
            x_expand: true
        });

        this._searchClearIcon = new St.Icon({
            icon_name: 'edit-clear-symbolic',
            style_class: 'stockbar-search-clear-icon'
        });
        this._searchEntry.set_secondary_icon(null);
        this._searchEntry.connect('secondary-icon-clicked', () => {
            this._searchEntry.set_text('');
            this._clearSearchResults();
        });
        
        this._searchEntry.clutter_text.connect('text-changed', () => {
            this._onSearchTextChanged();
        });
        
        this._searchEntry.clutter_text.connect('key-press-event', (actor, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Escape) {
                this._searchEntry.set_text('');
                this._clearSearchResults();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        
        searchContainer.add_child(this._searchEntry);
        this._mainContainer.add_child(searchContainer);
        
        // Search results container
        this._searchResultsBox = new St.BoxLayout({
            vertical: true,
            style_class: 'stockbar-search-results'
        });
        this._mainContainer.add_child(this._searchResultsBox);
        
        // Separator after search
        this._searchSeparator = new St.Widget({
            style_class: 'stockbar-separator',
            visible: false
        });
        this._mainContainer.add_child(this._searchSeparator);
        
        // Watchlist header
        const watchlistHeader = new St.Label({
            text: 'WATCHLIST',
            style_class: 'stockbar-section-header'
        });
        this._mainContainer.add_child(watchlistHeader);
        
        // Watchlist scroll view with fixed height
        this._watchlistScrollView = new St.ScrollView({
            style_class: 'stockbar-watchlist-scroll',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: true
        });
        
        this._watchlistBox = new St.BoxLayout({
            vertical: true,
            style_class: 'stockbar-watchlist-container'
        });
        
        this._watchlistScrollView.add_child(this._watchlistBox);
        this._mainContainer.add_child(this._watchlistScrollView);
        
        // Footer separator
        const footerSeparator = new St.Widget({
            style_class: 'stockbar-separator'
        });
        this._mainContainer.add_child(footerSeparator);
        
        // Footer with buttons
        const footerBox = new St.BoxLayout({
            vertical: true,
            style_class: 'stockbar-menu-footer'
        });
        
        // Refresh button
        const refreshButton = this._createFooterButton('view-refresh-symbolic', 'Refresh Now');
        refreshButton.connect('clicked', () => {
            this._refreshWatchlist();
            this.menu.close();
        });
        footerBox.add_child(refreshButton);
        
        // Settings button
        const settingsButton = this._createFooterButton('preferences-system-symbolic', 'Settings');
        settingsButton.connect('clicked', () => {
            try {
                GLib.spawn_command_line_async(`gnome-extensions prefs gnome-stocks@perpuchaty.github.com`);
            } catch (e) {
                console.debug(`GNOME Stocks: Could not open preferences: ${e.message}`);
            }
            this.menu.close();
        });
        footerBox.add_child(settingsButton);
        
        // Move Widgets button
        const moveWidgetsButton = this._createFooterButton('view-fullscreen-symbolic', 'Arrange Widgets');
        moveWidgetsButton.connect('clicked', () => {
            this._toggleWidgetMoveMode();
            this.menu.close();
        });
        footerBox.add_child(moveWidgetsButton);
        
        this._mainContainer.add_child(footerBox);
        
        // Add main container to menu
        const mainMenuItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false
        });
        mainMenuItem.add_child(this._mainContainer);
        this.menu.addMenuItem(mainMenuItem);
        this._applyFontSize();
        
        // Listen for font-size changes from preferences
        this._settings.connect('changed::font-size', () => {
            this._applyFontSize();
        });
    }
    
    _createFooterButton(iconName, label) {
        const button = new St.Button({
            style_class: 'stockbar-footer-button',
            x_expand: true
        });
        
        const box = new St.BoxLayout({
            style_class: 'stockbar-footer-button-box'
        });
        
        const icon = new St.Icon({
            icon_name: iconName,
            icon_size: 16,
            style_class: 'stockbar-footer-icon'
        });
        box.add_child(icon);
        
        const labelWidget = new St.Label({
            text: label,
            style_class: 'stockbar-footer-label',
            y_align: Clutter.ActorAlign.CENTER
        });
        box.add_child(labelWidget);
        
        button.set_child(box);
        return button;
    }
    
    _applyFontSize() {
        const fontSize = this._settings.get_int('font-size');
        const smallFontSize = Math.max(8, fontSize - 2);
        
        // Store for use in item creation
        this._fontSize = fontSize;
        this._smallFontSize = smallFontSize;
        
        // Refresh UI to apply changes
        this._updateWatchlistUI();
    }

    _onSearchTextChanged() {
        const text = this._searchEntry.get_text().trim();

        if (text.length > 0) {
            this._searchEntry.set_secondary_icon(this._searchClearIcon);
        } else {
            this._searchEntry.set_secondary_icon(null);
        }
        
        if (this._searchTimeout) {
            GLib.source_remove(this._searchTimeout);
            this._searchTimeout = null;
        }
        
        if (text.length < 1) {
            this._clearSearchResults();
            return;
        }
        
        // Debounce search
        this._searchTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
            this._searchTimeout = null;
            this._performSearch(text);
            return GLib.SOURCE_REMOVE;
        });
    }

    async _performSearch(query) {
        this._clearSearchResults();
        this._searchSeparator.visible = true;
        
        // Add loading indicator
        const loadingLabel = new St.Label({
            text: 'Searching...',
            style_class: 'stockbar-loading-message'
        });
        this._searchResultsBox.add_child(loadingLabel);
        
        try {
            const results = await this._api.searchStocks(query);
            this._clearSearchResults();
            
            if (!results || results.length === 0) {
                const noResultsLabel = new St.Label({
                    text: 'No results found',
                    style_class: 'stockbar-status-message'
                });
                this._searchResultsBox.add_child(noResultsLabel);
                
                // Also add option to add the typed text as a symbol directly
                if (query.length >= 1 && query.length <= 10 && /^[A-Za-z0-9.^=]+$/.test(query)) {
                    const directAddBtn = this._createDirectAddButton(query.toUpperCase());
                    this._searchResultsBox.add_child(directAddBtn);
                }
                return;
            }
            
            for (const stock of results.slice(0, 8)) {
                this._addSearchResultItem(stock);
            }

            const directSymbol = query.toUpperCase();
            const hasExactMatch = results.some(stock =>
                stock.symbol?.toUpperCase() === directSymbol ||
                stock.displaySymbol?.toUpperCase() === directSymbol
            );
            if (!hasExactMatch && query.length >= 1 && query.length <= 10 && /^[A-Za-z0-9.^=]+$/.test(query)) {
                const directAddBtn = this._createDirectAddButton(directSymbol);
                this._searchResultsBox.add_child(directAddBtn);
            }
        } catch (e) {
            this._clearSearchResults();
            this._searchSeparator.visible = true;
            console.debug(`GNOME Stocks: Search error: ${e.message}`);
            
            const errorLabel = new St.Label({
                text: 'Search unavailable',
                style_class: 'stockbar-status-message'
            });
            this._searchResultsBox.add_child(errorLabel);
            
            // Allow adding the typed text as a symbol directly
            if (query.length >= 1 && query.length <= 10 && /^[A-Za-z0-9.^=]+$/.test(query)) {
                const directAddBtn = this._createDirectAddButton(query.toUpperCase());
                this._searchResultsBox.add_child(directAddBtn);
            }
        }
    }
    
    _createDirectAddButton(symbol) {
        const button = new St.Button({
            style_class: 'stockbar-stock-item',
            x_expand: true
        });
        
        const box = new St.BoxLayout({
            style_class: 'stockbar-direct-add-box'
        });
        
        const icon = new St.Icon({
            icon_name: 'list-add-symbolic',
            icon_size: 16,
            style_class: 'stockbar-direct-add-icon'
        });
        box.add_child(icon);
        
        const label = new St.Label({
            text: `Add "${symbol}" directly`,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'stockbar-direct-add-label'
        });
        box.add_child(label);
        
        button.set_child(box);
        button.connect('clicked', () => {
            this._toggleWatchlist(symbol);
            this._clearSearchResults();
            this._searchEntry.set_text('');
        });
        
        return button;
    }

    _addSearchResultItem(stock) {
        const item = new St.Button({
            style_class: 'stockbar-search-result-item',
            x_expand: true
        });
        
        const box = new St.BoxLayout({
            style_class: 'stockbar-search-result-box'
        });
        
        // Logo placeholder
        const logoActor = isFxSymbol(stock.symbol, stock)
            ? createFxLabel(stock.symbol, stock, ICON_SIZE)
            : new St.Icon({
                icon_name: 'view-grid-symbolic',
                icon_size: ICON_SIZE,
                style_class: 'stockbar-stock-logo',
                y_align: Clutter.ActorAlign.CENTER
            });
        box.add_child(logoActor);
        
        // Load actual logo
        const logoUrl = this._api.getLogoUrl(stock.symbol, stock.name);
        if (!isFxSymbol(stock.symbol, stock) && logoUrl) {
            this._logoCache.loadLogo(stock.symbol, logoUrl, (gicon) => {
                if (gicon && logoActor instanceof St.Icon) {
                    logoActor.set_gicon(gicon);
                }
            });
        }
        
        // Stock info
        const infoBox = new St.BoxLayout({
            vertical: true,
            x_expand: true
        });
        this._infoBox = infoBox;
        
        // Add crypto indicator if applicable
        const isCrypto = stock.isCrypto || stock.type === 'CRYPTOCURRENCY' || stock.symbol.endsWith('-USD');
        let cleanSymbol = stock.displaySymbol || stock.symbol;
        if (isCrypto && cleanSymbol.endsWith('-USD')) {
            cleanSymbol = cleanSymbol.replace('-USD', '');
        }
        const displaySymbol = isCrypto ? `₿ ${cleanSymbol}` : cleanSymbol;
        
        const symbolLabel = new St.Label({
            text: displaySymbol,
            style_class: 'stockbar-stock-symbol'
        });
        infoBox.add_child(symbolLabel);
        
        const typeLabel = isCrypto ? ' (Crypto)' : (stock.type === 'ETF' ? ' (ETF)' : '');
        const nameLabel = new St.Label({
            text: stock.name + typeLabel,
            style_class: 'stockbar-stock-name'
        });
        infoBox.add_child(nameLabel);
        
        box.add_child(infoBox);
        
        // Add to watchlist button
        const watchlist = this._settings.get_strv('watchlist');
        const isInWatchlist = watchlist.includes(stock.symbol);
        
        const addButton = new St.Button({
            child: new St.Icon({
                icon_name: isInWatchlist ? 'starred-symbolic' : 'non-starred-symbolic',
                icon_size: 16
            }),
            style_class: 'stockbar-action-button'
        });
        
        addButton.connect('clicked', () => {
            this._toggleWatchlist(stock.symbol);
            const icon = addButton.get_child();
            const newWatchlist = this._settings.get_strv('watchlist');
            icon.set_icon_name(newWatchlist.includes(stock.symbol) ? 'starred-symbolic' : 'non-starred-symbolic');
        });
        
        box.add_child(addButton);
        
        item.set_child(box);
        item.connect('clicked', () => {
            this._toggleWatchlist(stock.symbol);
            this._clearSearchResults();
            this._searchEntry.set_text('');
        });
        
        this._searchResultsBox.add_child(item);
    }

    _clearSearchResults() {
        this._searchResultsBox.destroy_all_children();
        this._searchSeparator.visible = false;
    }

    _toggleWatchlist(symbol) {
        const watchlist = this._settings.get_strv('watchlist');
        const index = watchlist.indexOf(symbol);
        
        if (index === -1) {
            watchlist.push(symbol);
        } else {
            watchlist.splice(index, 1);
            try {
                const customNames = JSON.parse(this._settings.get_string('custom-stock-names') || '{}');
                if (customNames[symbol]) {
                    delete customNames[symbol];
                    this._settings.set_string('custom-stock-names', JSON.stringify(customNames));
                }
            } catch (e) {
                console.debug(`GNOME Stocks: Error updating custom names: ${e.message}`);
            }
            // Also remove from panel stocks if present
            const panelStocks = this._settings.get_strv('panel-stocks');
            const panelIndex = panelStocks.indexOf(symbol);
            if (panelIndex !== -1) {
                panelStocks.splice(panelIndex, 1);
                this._settings.set_strv('panel-stocks', panelStocks);
            }
        }
        
        this._settings.set_strv('watchlist', watchlist);
    }

    _togglePanelStock(symbol) {
        const panelStocks = this._settings.get_strv('panel-stocks');
        const index = panelStocks.indexOf(symbol);
        
        if (index === -1) {
            panelStocks.push(symbol);
        } else {
            panelStocks.splice(index, 1);
        }
        
        this._settings.set_strv('panel-stocks', panelStocks);
    }

    async _loadWatchlist() {
        const watchlist = this._settings.get_strv('watchlist');
        const customNames = getCustomNamesMap(this._settings);
        const labelOrder = this._settings.get_string('watchlist-label-order');
        const showSecondaryLabel = this._settings.get_boolean('watchlist-show-secondary-label');
        
        // Clear current items
        this._watchlistBox.destroy_all_children();
        
        if (watchlist.length === 0) {
            const emptyLabel = new St.Label({
                text: 'No stocks in watchlist.\nSearch and add stocks above.',
                style_class: 'stockbar-empty-watchlist'
            });
            this._watchlistBox.add_child(emptyLabel);
            return;
        }
        
        // Add loading placeholders
        for (const symbol of watchlist) {
            this._addWatchlistItem(symbol, null, customNames, labelOrder, showSecondaryLabel);
        }
        
        // Fetch quotes
        await this._refreshWatchlist();
    }

    async _refreshWatchlist() {
        const watchlist = this._settings.get_strv('watchlist');
        const panelStocks = this._settings.get_strv('panel-stocks');
        
        // Combine watchlist and panel stocks for fetching
        const allSymbols = [...new Set([...watchlist, ...panelStocks])];
        
        if (allSymbols.length === 0) return;
        
        try {
            const quotes = await this._api.getMultipleQuotes(allSymbols);
            
            for (const quote of quotes) {
                if (!quote.error) {
                    SharedData.setQuote(quote.symbol, quote);
                }
            }
            
            this._updateWatchlistUI();
        } catch (e) {
            console.debug(`GNOME Stocks: Error refreshing watchlist: ${e.message}`);
        }
    }

    _addWatchlistItem(symbol, quote, customNames, labelOrder) {
        const showSecondaryLabel = this._settings.get_boolean('watchlist-show-secondary-label');
        const item = new St.BoxLayout({
            style_class: 'stockbar-watchlist-item',
            reactive: true,
            track_hover: true
        });
        
        // Logo
        const logoActor = isFxSymbol(symbol, quote)
            ? createFxLabel(symbol, quote, ICON_SIZE)
            : new St.Icon({
                icon_name: 'view-grid-symbolic',
                icon_size: ICON_SIZE,
                y_align: Clutter.ActorAlign.CENTER
            });
        item.add_child(logoActor);
        
        // Load logo
        const logoUrl = this._api.getLogoUrl(symbol, quote?.name);
        if (!isFxSymbol(symbol, quote) && logoUrl) {
            this._logoCache.loadLogo(symbol, logoUrl, (gicon) => {
                if (gicon && logoActor instanceof St.Icon) {
                    logoActor.set_gicon(gicon);
                }
            });
        }
        
        // Info box
        const infoBox = new St.BoxLayout({
            vertical: true,
            x_expand: true
        });
        
        const fontSize = this._fontSize || 12;
        const smallFontSize = this._smallFontSize || 10;
        
        // Add crypto indicator if applicable
        const isCrypto = quote?.isCrypto || symbol.endsWith('-USD');
        // Use displaySymbol from quote if available, otherwise clean it ourselves
        let cleanSymbol = quote?.displaySymbol || symbol;
        if (isCrypto && cleanSymbol.endsWith('-USD')) {
            cleanSymbol = cleanSymbol.replace('-USD', '');
        }
        const displaySymbol = isCrypto ? `₿ ${cleanSymbol}` : cleanSymbol;
        const displayName = customNames?.[symbol] || quote?.name || 'Loading...';
        const isNameFirst = labelOrder === LABEL_ORDER_NAME_FIRST;
        
        const symbolLabel = new St.Label({
            text: displaySymbol
        });
        symbolLabel.set_name(`symbol-${symbol}`);
        
        const nameLabel = new St.Label({
            text: displayName
        });
        nameLabel.set_name(`name-${symbol}`);

        const topLabel = isNameFirst ? nameLabel : symbolLabel;
        const bottomLabel = isNameFirst ? symbolLabel : nameLabel;

        topLabel.style_class = `stockbar-stock-symbol-label ${getFontSizeClass(fontSize)}`;
        bottomLabel.style_class = `stockbar-stock-name-label ${getFontSizeClass(smallFontSize)}`;
        
        if (isNameFirst) {
            infoBox.add_child(nameLabel);
            if (showSecondaryLabel) {
                infoBox.add_child(symbolLabel);
            }
        } else {
            infoBox.add_child(symbolLabel);
            if (showSecondaryLabel) {
                infoBox.add_child(nameLabel);
            }
        }
        
        item.add_child(infoBox);
        
        // Price box
        const priceBox = new St.BoxLayout({
            vertical: true,
            style_class: 'stockbar-stock-price-box'
        });
        
        const priceLabel = new St.Label({
            text: quote ? formatCurrency(quote.price, quote.currency, this._settings.get_boolean('format-large-prices')) : '--',
            style_class: `stockbar-stock-price-label ${getFontSizeClass(fontSize)}`
        });
        priceLabel.set_name(`price-${symbol}`);
        priceBox.add_child(priceLabel);
        
        const changeText = quote ? 
            `${quote.change >= 0 ? '+' : ''}${quote.change.toFixed(2)} (${quote.changePercent.toFixed(2)}%)` : 
            '--';
        
        const changeClass = getChangeClass(quote ? quote.change : 0);
        const changeLabel = new St.Label({
            text: changeText,
            style_class: `stockbar-stock-change-label ${getFontSizeClass(smallFontSize)} ${changeClass}`
        });
        changeLabel.set_name(`change-${symbol}`);
        priceBox.add_child(changeLabel);
        
        item.add_child(priceBox);
        
        // Desktop widget pin button
        const desktopWidgets = this._settings.get_strv('desktop-widgets');
        const isPinned = desktopWidgets.includes(symbol);
        
        const pinButton = new St.Button({
            child: new St.Icon({
                icon_name: isPinned ? 'view-pin-symbolic' : 'view-pin-symbolic',
                icon_size: 14
            }),
            style_class: isPinned ? 'stockbar-item-button-active' : 'stockbar-item-button'
        });
        pinButton.set_name(`pin-btn-${symbol}`);
        
        pinButton.connect('clicked', () => {
            this._toggleDesktopWidget(symbol);
            const newDesktopWidgets = this._settings.get_strv('desktop-widgets');
            const isPinnedNow = newDesktopWidgets.includes(symbol);
            pinButton.style_class = isPinnedNow ? 'stockbar-item-button-active' : 'stockbar-item-button';
        });
        
        item.add_child(pinButton);
        
        // Panel toggle button
        const panelStocks = this._settings.get_strv('panel-stocks');
        const isOnPanel = panelStocks.includes(symbol);
        
        const panelButton = new St.Button({
            child: new St.Icon({
                icon_name: isOnPanel ? 'view-reveal-symbolic' : 'view-conceal-symbolic',
                icon_size: 14
            }),
            style_class: 'stockbar-item-button'
        });
        panelButton.set_name(`panel-btn-${symbol}`);
        
        panelButton.connect('clicked', () => {
            this._togglePanelStock(symbol);
            const newPanelStocks = this._settings.get_strv('panel-stocks');
            const icon = panelButton.get_child();
            icon.set_icon_name(newPanelStocks.includes(symbol) ? 'view-reveal-symbolic' : 'view-conceal-symbolic');
        });
        
        item.add_child(panelButton);
        
        // Remove button
        const removeButton = new St.Button({
            child: new St.Icon({
                icon_name: 'user-trash-symbolic',
                icon_size: 14
            }),
            style_class: 'stockbar-item-button'
        });
        
        removeButton.connect('clicked', () => {
            this._toggleWatchlist(symbol);
        });
        
        item.add_child(removeButton);
        
        item.set_name(`watchlist-item-${symbol}`);
        this._watchlistBox.add_child(item);
    }
    
    _toggleDesktopWidget(symbol) {
        const desktopWidgets = this._settings.get_strv('desktop-widgets');
        const index = desktopWidgets.indexOf(symbol);
        
        if (index === -1) {
            desktopWidgets.push(symbol);
        } else {
            desktopWidgets.splice(index, 1);
            // Also remove position data
            try {
                const positions = JSON.parse(this._settings.get_string('desktop-widget-positions') || '{}');
                delete positions[symbol];
                this._settings.set_string('desktop-widget-positions', JSON.stringify(positions));
            } catch (e) {
                console.debug(`GNOME Stocks: Error removing widget position: ${e.message}`);
            }
        }
        
        this._settings.set_strv('desktop-widgets', desktopWidgets);
    }
    
    _toggleWidgetMoveMode() {
        // Signal all widgets to enter move mode by temporarily raising them above other windows
        const desktopWidgets = this._settings.get_strv('desktop-widgets');
        
        if (desktopWidgets.length === 0) {
            Main.notify('GNOME Stocks', 'No desktop widgets to arrange. Pin some stocks first!');
            return;
        }
        
        // Toggle the move mode setting
        const currentMode = this._settings.get_boolean('widget-move-mode') || false;
        this._settings.set_boolean('widget-move-mode', !currentMode);
        
        if (!currentMode) {
            Main.notify('GNOME Stocks', 'Widget move mode ON - Drag widgets to reposition. Click "Arrange Widgets" again to finish.');
        } else {
            Main.notify('GNOME Stocks', 'Widget positions saved!');
        }
    }

    _updateWatchlistUI() {
        this._watchlistBox.destroy_all_children();
        
        const watchlist = this._settings.get_strv('watchlist');
        const customNames = getCustomNamesMap(this._settings);
        const labelOrder = this._settings.get_string('watchlist-label-order');
        const showSecondaryLabel = this._settings.get_boolean('watchlist-show-secondary-label');
        
        if (watchlist.length === 0) {
            const emptyLabel = new St.Label({
                text: 'No stocks in watchlist.\nSearch and add stocks above.',
                style_class: 'stockbar-empty-watchlist'
            });
            this._watchlistBox.add_child(emptyLabel);
            return;
        }
        
        for (const symbol of watchlist) {
            const quote = SharedData.getQuote(symbol) || null;
            this._addWatchlistItem(symbol, quote, customNames, labelOrder, showSecondaryLabel);
        }
    }

    _startRefreshTimer() {
        const interval = this._settings.get_int('refresh-interval');
        
        if (this._refreshTimeout) {
            GLib.source_remove(this._refreshTimeout);
        }
        
        this._refreshTimeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, () => {
            this._refreshWatchlist();
            return GLib.SOURCE_CONTINUE;
        });
    }

    destroy() {
        if (this._refreshTimeout) {
            GLib.source_remove(this._refreshTimeout);
            this._refreshTimeout = null;
        }
        
        if (this._searchTimeout) {
            GLib.source_remove(this._searchTimeout);
            this._searchTimeout = null;
        }
        
        this._settings.disconnectObject(this);
        
        // Only destroy shared data if this is the main menu
        SharedData.destroy();
        
        super.destroy();
    }
});

// Individual stock panel button with chart popup
export const StockPanelButton = GObject.registerClass(
class StockPanelButton extends PanelMenu.Button {
    _init(symbol, settings, mainIndicator) {
        super._init(0.0, `GNOME Stocks-${symbol}`);
        
        this._symbol = symbol;
        this._settings = settings;
        this._mainIndicator = mainIndicator;
        this._chartData = null;
        this._loadingChart = false;
        this._currentRange = '1mo';
        this._currentInterval = '1d';
        
        // Initialize shared data
        SharedData.init();
        
        // Listen for settings changes
        this._settings.connectObject(
            'changed::chart-style', () => {
                if (this._chartData) {
                    this._renderChart(this._chartData);
                }
            },
            'changed', (settings, key) => {
                if (key.startsWith('show-stock-')) {
                    this._updatePanelVisibility();
                } else if (key === 'format-large-prices') {
                    this._updateDisplay();
                }
            },
            this
        );
        
        // Panel button layout
        this._panelBox = new St.BoxLayout({
            style_class: 'stockbar-panel-box'
        });
        
        // Logo
        this._logoIcon = isFxSymbol(this._symbol, null)
            ? createFxLabel(this._symbol, null, PANEL_ICON_SIZE)
            : new St.Icon({
                icon_name: 'view-grid-symbolic',
                icon_size: PANEL_ICON_SIZE
            });
        this._panelBox.add_child(this._logoIcon);
        
        // Load logo
        this._loadLogo();
        
        // Symbol label
        this._symbolLabel = new St.Label({
            text: symbol,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'stockbar-panel-symbol-label'
        });
        this._panelBox.add_child(this._symbolLabel);
        
        // Price label
        this._priceLabel = new St.Label({
            text: '...',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'stockbar-panel-price-label'
        });
        this._panelBox.add_child(this._priceLabel);
        
        // Change label
        this._changeLabel = new St.Label({
            text: '',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'stockbar-panel-change-label'
        });
        this._panelBox.add_child(this._changeLabel);
        
        this.add_child(this._panelBox);
        
        // Build chart popup menu
        this._buildChartMenu();
        
        // Listen for data updates
        this._updateCallback = () => this._updateDisplay();
        SharedData.addListener(this._updateCallback);
        
        // Initial update
        this._updateDisplay();
        
        // Apply initial visibility settings
        this._updatePanelVisibility();
    }
    
    _updatePanelVisibility() {
        const showIcon = this._settings.get_boolean('show-stock-icon');
        const showName = this._settings.get_boolean('show-stock-name');
        const showPrice = this._settings.get_boolean('show-stock-price');
        const showGain = this._settings.get_boolean('show-stock-gain');
        
        this._logoIcon.visible = showIcon;
        this._symbolLabel.visible = showName;
        this._priceLabel.visible = showPrice;
        this._changeLabel.visible = showGain;
    }
    
    _loadLogo() {
        const quote = SharedData.getQuote(this._symbol);
        if (isFxSymbol(this._symbol, quote)) {
            if (!(this._logoIcon instanceof St.Label)) {
                this._panelBox.remove_child(this._logoIcon);
                this._logoIcon = createFxLabel(this._symbol, quote, PANEL_ICON_SIZE);
                this._panelBox.insert_child_at_index(this._logoIcon, 0);
            } else {
                this._logoIcon.set_text(getFxLabelText(this._symbol, quote));
            }
            return;
        }
        const logoUrl = SharedData.api?.getLogoUrl(this._symbol, quote?.name);
        if (logoUrl && SharedData.logoCache) {
            SharedData.logoCache.loadLogo(this._symbol, logoUrl, (gicon) => {
                if (gicon && this._logoIcon instanceof St.Icon && !this._logoIcon.is_finalized?.()) {
                    this._logoIcon.set_gicon(gicon);
                }
            });
        }
    }
    
    _updateDisplay() {
        const quote = SharedData.getQuote(this._symbol);
        
        if (quote) {
            // Update symbol (clean for crypto)
            const isCrypto = quote.isCrypto || this._symbol.endsWith('-USD');
            let cleanSymbol = quote.displaySymbol || this._symbol;
            if (isCrypto && cleanSymbol.endsWith('-USD')) {
                cleanSymbol = cleanSymbol.replace('-USD', '');
            }
            this._symbolLabel.set_text(cleanSymbol);
            
            // Update price
            this._priceLabel.set_text(formatCurrency(quote.price, quote.currency, this._settings.get_boolean('format-large-prices')));
            
            // Update change
            const changeSymbol = quote.change >= 0 ? '▲' : '▼';
            this._changeLabel.set_text(`${changeSymbol}${Math.abs(quote.changePercent).toFixed(1)}%`);
            const changeClass = getChangeClass(quote.change);
            this._changeLabel.style_class = `stockbar-panel-change-label ${changeClass}`;
            
            // Update menu header
            this._updateMenuHeader(quote);
            
            // Load logo if not loaded
            this._loadLogo();
        }
    }
    
    _buildChartMenu() {
        // Header with stock info
        this._headerSection = new PopupMenu.PopupMenuSection();
        
        const headerBox = new St.BoxLayout({
            vertical: true,
            style_class: 'stockbar-chart-header-box'
        });
        
        // Stock name and price row
        this._menuHeader = new St.BoxLayout({
            style_class: 'stockbar-chart-menu-header'
        });
        
        this._menuLogo = new St.Icon({
            icon_name: 'view-grid-symbolic',
            icon_size: 32
        });
        this._menuHeader.add_child(this._menuLogo);
        
        const infoBox = new St.BoxLayout({
            vertical: true,
            x_expand: true
        });
        
        this._menuSymbol = new St.Label({
            text: this._symbol,
            style_class: 'stockbar-chart-menu-symbol'
        });
        infoBox.add_child(this._menuSymbol);
        
        this._menuName = new St.Label({
            text: 'Loading...',
            style_class: 'stockbar-chart-menu-name'
        });
        infoBox.add_child(this._menuName);
        
        this._menuHeader.add_child(infoBox);
        
        const priceBox = new St.BoxLayout({
            vertical: true,
            style_class: 'stockbar-stock-price-box'
        });
        
        this._menuPrice = new St.Label({
            text: '--',
            style_class: 'stockbar-chart-menu-price'
        });
        priceBox.add_child(this._menuPrice);
        
        this._menuChange = new St.Label({
            text: '--',
            style_class: 'stockbar-chart-menu-change'
        });
        priceBox.add_child(this._menuChange);
        
        this._menuHeader.add_child(priceBox);
        headerBox.add_child(this._menuHeader);
        
        const headerItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false
        });
        headerItem.add_child(headerBox);
        this._headerSection.addMenuItem(headerItem);
        this.menu.addMenuItem(this._headerSection);
        
        // Separator
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        // Chart section
        this._chartSection = new PopupMenu.PopupMenuSection();
        
        const chartBox = new St.BoxLayout({
            vertical: true,
            style_class: 'stockbar-chart-box'
        });
        
        // Time range buttons
        const rangeBox = new St.BoxLayout({
            style_class: 'stockbar-chart-range-box'
        });
        
        const ranges = [
            { label: '1D', range: '1d', interval: '5m' },
            { label: '5D', range: '5d', interval: '15m' },
            { label: '1M', range: '1mo', interval: '1d' },
            { label: '3M', range: '3mo', interval: '1d' },
            { label: '6M', range: '6mo', interval: '1d' },
            { label: '1Y', range: '1y', interval: '1wk' }
        ];
        
        this._rangeButtons = [];
        for (const r of ranges) {
            const btn = new St.Button({
                label: r.label,
                style_class: 'stockbar-range-button'
            });
            btn._range = r.range;
            btn._interval = r.interval;
            btn.connect('clicked', () => {
                this._loadChart(r.range, r.interval);
                this._highlightRangeButton(btn);
            });
            rangeBox.add_child(btn);
            this._rangeButtons.push(btn);
        }
        
        chartBox.add_child(rangeBox);
        
        // Chart display area - using DrawingArea for nice graphics
        this._chartContainer = new St.BoxLayout({
            vertical: true,
            style_class: 'stockbar-chart-container'
        });
        
        // Chart canvas
        this._chartCanvas = new St.DrawingArea({
            width: 300,
            height: 120,
            style_class: 'stockbar-chart-canvas'
        });
        this._chartCanvas.connect('repaint', (area) => this._drawChart(area));
        this._chartContainer.add_child(this._chartCanvas);
        
        // Chart info label (for change info)
        this._chartInfoLabel = new St.Label({
            text: 'Click a time range to load chart',
            style_class: 'stockbar-chart-info'
        });
        this._chartContainer.add_child(this._chartInfoLabel);
        
        chartBox.add_child(this._chartContainer);
        
        // Stats row
        this._statsBox = new St.BoxLayout({
            style_class: 'stockbar-chart-stats-box'
        });
        
        this._highLabel = new St.Label({
            text: 'H: --',
            style_class: 'stockbar-stat-high'
        });
        this._statsBox.add_child(this._highLabel);
        
        this._lowLabel = new St.Label({
            text: 'L: --',
            style_class: 'stockbar-stat-low'
        });
        this._statsBox.add_child(this._lowLabel);
        
        this._volumeLabel = new St.Label({
            text: 'Vol: --',
            style_class: 'stockbar-stat-volume'
        });
        this._statsBox.add_child(this._volumeLabel);
        
        chartBox.add_child(this._statsBox);
        
        const chartItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false
        });
        chartItem.add_child(chartBox);
        this._chartSection.addMenuItem(chartItem);
        this.menu.addMenuItem(this._chartSection);
        
        // Separator
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        // Actions
        const removeItem = new PopupMenu.PopupMenuItem('Remove from panel');
        removeItem.connect('activate', () => {
            this._removeFromPanel();
        });
        this.menu.addMenuItem(removeItem);
        
        // Load chart when menu opens
        this.menu.connect('open-state-changed', (menu, isOpen) => {
            if (isOpen && !this._chartData) {
                this._loadChart('1mo', '1d');
                this._highlightRangeButton(this._rangeButtons[2]); // 1M default
            }
        });
    }
    
    _highlightRangeButton(activeBtn) {
        for (const btn of this._rangeButtons) {
            if (btn === activeBtn) {
                btn.style_class = 'stockbar-range-button-active';
            } else {
                btn.style_class = 'stockbar-range-button';
            }
        }
    }
    
    _updateMenuHeader(quote) {
        if (!quote) return;
        
        const isCrypto = quote.isCrypto || this._symbol.endsWith('-USD');
        let cleanSymbol = quote.displaySymbol || this._symbol;
        if (isCrypto && cleanSymbol.endsWith('-USD')) {
            cleanSymbol = cleanSymbol.replace('-USD', '');
        }
        const displaySymbol = isCrypto ? `₿ ${cleanSymbol}` : cleanSymbol;
        
        this._menuSymbol.set_text(displaySymbol);
        this._menuName.set_text(quote.name || this._symbol);
        this._menuPrice.set_text(formatCurrency(quote.price, quote.currency, this._settings.get_boolean('format-large-prices')));
        
        const changeSign = quote.change >= 0 ? '+' : '';
        this._menuChange.set_text(`${changeSign}${quote.change.toFixed(2)} (${quote.changePercent.toFixed(2)}%)`);
        const changeClass = getChangeClass(quote.change);
        this._menuChange.style_class = `stockbar-chart-menu-change ${changeClass}`;
        
        // Load menu logo
        if (isFxSymbol(this._symbol, quote)) {
            if (!(this._menuLogo instanceof St.Label)) {
                this._menuHeader.remove_child(this._menuLogo);
                this._menuLogo = createFxLabel(this._symbol, quote, 16);
                this._menuHeader.insert_child_at_index(this._menuLogo, 0);
            } else {
                this._menuLogo.set_text(getFxLabelText(this._symbol, quote));
            }
            return;
        }
        const logoUrl = SharedData.api?.getLogoUrl(this._symbol, quote.name);
        if (logoUrl && SharedData.logoCache) {
            SharedData.logoCache.loadLogo(this._symbol, logoUrl, (gicon) => {
                if (gicon && this._menuLogo && !this._menuLogo.is_finalized?.()) {
                    this._menuLogo.set_gicon(gicon);
                }
            });
        }
    }
    
    async _loadChart(range, interval) {
        if (this._loadingChart) return;
        
        this._loadingChart = true;
        this._currentRange = range;
        this._currentInterval = interval;
        this._chartInfoLabel.set_text('Loading chart...');
        this._chartCanvas.queue_repaint();
        
        try {
            const data = await SharedData.api.getChartData(this._symbol, range, interval);
            this._chartData = data;
            this._renderChart(data);
        } catch (e) {
            console.debug(`GNOME Stocks: Error loading chart: ${e.message}`);
            this._chartInfoLabel.set_text('Failed to load chart');
            this._chartCanvas.queue_repaint();
        } finally {
            this._loadingChart = false;
        }
    }
    
    _renderChart(data) {
        if (!data || !data.prices || data.prices.length === 0) {
            this._chartInfoLabel.set_text('No data available');
            this._chartCanvas.queue_repaint();
            return;
        }
        
        const prices = data.prices.map(p => p.close);
        const firstPrice = prices[0];
        const lastPrice = prices[prices.length - 1];
        const priceChange = lastPrice - firstPrice;
        const priceChangePercent = (priceChange / firstPrice) * 100;
        
        const changeSign = priceChange >= 0 ? '+' : '';
        this._chartInfoLabel.set_text(`Change: ${changeSign}$${priceChange.toFixed(2)} (${changeSign}${priceChangePercent.toFixed(2)}%)`);
        const changeClass = getChangeClass(priceChange);
        this._chartInfoLabel.style_class = `stockbar-chart-info-active ${changeClass}`;
        
        // Trigger repaint
        this._chartCanvas.queue_repaint();
        
        // Update stats
        const highs = data.prices.map(p => p.high).filter(h => h !== null && h !== undefined);
        const lows = data.prices.map(p => p.low).filter(l => l !== null && l !== undefined);
        const volumes = data.prices.map(p => p.volume).filter(v => v !== null && v !== undefined);
        
        if (highs.length > 0) {
            this._highLabel.set_text(`H: $${Math.max(...highs).toFixed(2)}`);
        }
        if (lows.length > 0) {
            this._lowLabel.set_text(`L: $${Math.min(...lows).toFixed(2)}`);
        }
        if (volumes.length > 0) {
            const totalVol = volumes.reduce((a, b) => a + b, 0);
            this._volumeLabel.set_text(`Vol: ${this._formatVolume(totalVol)}`);
        }
    }
    
    _drawChart(area) {
        const [width, height] = area.get_surface_size();
        const cr = area.get_context();
        
        // Clear background
        cr.setSourceRGBA(0, 0, 0, 0);
        cr.paint();
        
        if (!this._chartData || !this._chartData.prices || this._chartData.prices.length === 0) {
            // Draw placeholder text
            cr.setSourceRGBA(0.6, 0.6, 0.6, 1);
            cr.selectFontFace('Sans', Cairo.FontSlant.NORMAL, Cairo.FontWeight.NORMAL);
            cr.setFontSize(12);
            const text = this._loadingChart ? 'Loading...' : 'Select a time range';
            const extents = cr.textExtents(text);
            cr.moveTo((width - extents.width) / 2, (height + extents.height) / 2);
            cr.showText(text);
            return;
        }
        
        const prices = this._chartData.prices.map(p => p.close);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const range = max - min || 1;
        
        const padding = { top: 20, right: 10, bottom: 25, left: 55 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        
        const firstPrice = prices[0];
        const lastPrice = prices[prices.length - 1];
        const isPositive = lastPrice >= firstPrice;
        
        // Colors
        const lineColor = isPositive ? [0.298, 0.686, 0.314, 1] : [0.957, 0.263, 0.212, 1]; // Green or Red
        const fillColor = isPositive ? [0.298, 0.686, 0.314, 0.2] : [0.957, 0.263, 0.212, 0.2];
        const gridColor = [0.4, 0.4, 0.4, 0.3];
        const textColor = [0.8, 0.8, 0.8, 1];
        
        // Draw grid lines
        cr.setSourceRGBA(...gridColor);
        cr.setLineWidth(0.5);
        
        // Horizontal grid lines (5 lines)
        for (let i = 0; i <= 4; i++) {
            const y = padding.top + (chartHeight / 4) * i;
            cr.moveTo(padding.left, y);
            cr.lineTo(width - padding.right, y);
        }
        cr.stroke();
        
        // Draw price labels on Y axis
        cr.setSourceRGBA(...textColor);
        cr.selectFontFace('Sans', Cairo.FontSlant.NORMAL, Cairo.FontWeight.NORMAL);
        cr.setFontSize(9);
        
        for (let i = 0; i <= 4; i++) {
            const y = padding.top + (chartHeight / 4) * i;
            const price = max - (range / 4) * i;
            const priceText = `$${price.toFixed(2)}`;
            const extents = cr.textExtents(priceText);
            cr.moveTo(padding.left - extents.width - 5, y + 3);
            cr.showText(priceText);
        }
        
        // Get chart style
        const chartStyle = this._settings.get_string('chart-style') || 'bar';
        
        if (chartStyle === 'line') {
            this._drawLineChart(cr, prices, padding, chartWidth, chartHeight, min, range, lineColor, fillColor);
        } else if (chartStyle === 'candle') {
            this._drawCandleChart(cr, this._chartData.prices, padding, chartWidth, chartHeight, min, range);
        } else {
            this._drawBarChart(cr, prices, padding, chartWidth, chartHeight, min, range, lineColor, fillColor);
        }
        
        // Draw current price indicator
        cr.setSourceRGBA(...lineColor);
        const currentY = padding.top + chartHeight - ((lastPrice - min) / range) * chartHeight;
        cr.arc(width - padding.right, currentY, 3, 0, 2 * Math.PI);
        cr.fill();
        
        cr.$dispose();
    }
    
    _drawLineChart(cr, prices, padding, chartWidth, chartHeight, min, range, lineColor, fillColor) {
        const stepX = chartWidth / (prices.length - 1);
        
        // Draw filled area under line
        cr.setSourceRGBA(...fillColor);
        cr.moveTo(padding.left, padding.top + chartHeight);
        
        for (let i = 0; i < prices.length; i++) {
            const x = padding.left + stepX * i;
            const y = padding.top + chartHeight - ((prices[i] - min) / range) * chartHeight;
            cr.lineTo(x, y);
        }
        
        cr.lineTo(padding.left + chartWidth, padding.top + chartHeight);
        cr.closePath();
        cr.fill();
        
        // Draw the line
        cr.setSourceRGBA(...lineColor);
        cr.setLineWidth(2);
        cr.setLineCap(Cairo.LineCap.ROUND);
        cr.setLineJoin(Cairo.LineJoin.ROUND);
        
        cr.moveTo(padding.left, padding.top + chartHeight - ((prices[0] - min) / range) * chartHeight);
        
        for (let i = 1; i < prices.length; i++) {
            const x = padding.left + stepX * i;
            const y = padding.top + chartHeight - ((prices[i] - min) / range) * chartHeight;
            cr.lineTo(x, y);
        }
        cr.stroke();
        
        // Draw data points for smaller datasets
        if (prices.length <= 30) {
            cr.setSourceRGBA(...lineColor);
            for (let i = 0; i < prices.length; i++) {
                const x = padding.left + stepX * i;
                const y = padding.top + chartHeight - ((prices[i] - min) / range) * chartHeight;
                cr.arc(x, y, 2.5, 0, 2 * Math.PI);
                cr.fill();
            }
        }
    }
    
    _drawBarChart(cr, prices, padding, chartWidth, chartHeight, min, range, lineColor, fillColor) {
        const barWidth = Math.max(2, (chartWidth / prices.length) - 1);
        const stepX = chartWidth / prices.length;
        
        for (let i = 0; i < prices.length; i++) {
            const x = padding.left + stepX * i;
            const barHeight = ((prices[i] - min) / range) * chartHeight;
            const y = padding.top + chartHeight - barHeight;
            
            // Gradient effect for bars
            const gradient = new Cairo.LinearGradient(x, y, x, padding.top + chartHeight);
            gradient.addColorStopRGBA(0, lineColor[0], lineColor[1], lineColor[2], 0.9);
            gradient.addColorStopRGBA(1, lineColor[0], lineColor[1], lineColor[2], 0.4);
            cr.setSource(gradient);
            
            // Rounded top corners
            const radius = Math.min(barWidth / 2, 3);
            cr.moveTo(x, padding.top + chartHeight);
            cr.lineTo(x, y + radius);
            cr.arc(x + radius, y + radius, radius, Math.PI, 1.5 * Math.PI);
            cr.lineTo(x + barWidth - radius, y);
            cr.arc(x + barWidth - radius, y + radius, radius, 1.5 * Math.PI, 2 * Math.PI);
            cr.lineTo(x + barWidth, padding.top + chartHeight);
            cr.closePath();
            cr.fill();
        }
    }
    
    _drawCandleChart(cr, priceData, padding, chartWidth, chartHeight, min, range) {
        const candleWidth = Math.max(3, (chartWidth / priceData.length) - 2);
        const stepX = chartWidth / priceData.length;
        
        for (let i = 0; i < priceData.length; i++) {
            const p = priceData[i];
            if (!p.open || !p.close || !p.high || !p.low) continue;
            
            const x = padding.left + stepX * i + (stepX - candleWidth) / 2;
            const isUp = p.close >= p.open;
            
            // Candle colors
            const color = isUp ? [0.298, 0.686, 0.314, 1] : [0.957, 0.263, 0.212, 1];
            cr.setSourceRGBA(...color);
            
            // Draw wick (high-low line)
            const highY = padding.top + chartHeight - ((p.high - min) / range) * chartHeight;
            const lowY = padding.top + chartHeight - ((p.low - min) / range) * chartHeight;
            const wickX = x + candleWidth / 2;
            
            cr.setLineWidth(1);
            cr.moveTo(wickX, highY);
            cr.lineTo(wickX, lowY);
            cr.stroke();
            
            // Draw body (open-close rectangle)
            const openY = padding.top + chartHeight - ((p.open - min) / range) * chartHeight;
            const closeY = padding.top + chartHeight - ((p.close - min) / range) * chartHeight;
            const bodyTop = Math.min(openY, closeY);
            const bodyHeight = Math.max(Math.abs(closeY - openY), 1);
            
            cr.rectangle(x, bodyTop, candleWidth, bodyHeight);
            cr.fill();
        }
    }
    
    _formatVolume(vol) {
        if (vol >= 1e9) return `${(vol / 1e9).toFixed(1)}B`;
        if (vol >= 1e6) return `${(vol / 1e6).toFixed(1)}M`;
        if (vol >= 1e3) return `${(vol / 1e3).toFixed(1)}K`;
        return vol.toString();
    }
    
    _removeFromPanel() {
        const panelStocks = this._settings.get_strv('panel-stocks');
        const index = panelStocks.indexOf(this._symbol);
        if (index !== -1) {
            panelStocks.splice(index, 1);
            this._settings.set_strv('panel-stocks', panelStocks);
        }
    }
    
    destroy() {
        SharedData.removeListener(this._updateCallback);
        
        this._settings.disconnectObject(this);
        
        super.destroy();
    }
});

// Desktop Stock Widget - always visible on desktop background
export const DesktopStockWidget = GObject.registerClass(
class DesktopStockWidget extends St.BoxLayout {
    _init(symbol, settings, api, logoCache) {
        const opacity = settings.get_int('desktop-widget-opacity');
        const scale = settings.get_double('desktop-widget-scale');
        const opacityClass = getWidgetOpacityClass(opacity);
        const scaleClass = getWidgetScaleClass(scale);
        
        super._init({
            vertical: true,
            reactive: true,
            track_hover: true,
            style_class: `stockbar-desktop-widget ${opacityClass} ${scaleClass}`
        });
        
        this._symbol = symbol;
        this._settings = settings;
        this._api = api || SharedData.api;
        this._logoCache = logoCache || SharedData.logoCache;
        this._chartData = null;
        this._scale = scale;
        this._dragging = false;
        this._dragStartX = 0;
        this._dragStartY = 0;
        this._dragOffsetX = 0;
        this._dragOffsetY = 0;
        this._rangeButtons = [];
        this._selectedRange = null; // Will be loaded in _buildUI
        this._initTimeout = null;
        
        this._buildUI();
        this._loadPosition();
        
        // Load chart after a delay to ensure API is available
        this._initTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            this._initTimeout = null;
            const range = this._selectedRange || { range: '1mo', interval: '1d' };
            this._loadChart(range.range, range.interval);
            return GLib.SOURCE_REMOVE;
        });
        
        // Listen for data updates
        this._updateCallback = () => this._updateData();
        SharedData.addListener(this._updateCallback);
        
        // Listen for settings changes
        this._settings.connectObject(
            'changed', (settings, key) => {
                if (key === 'desktop-widget-opacity' || key === 'desktop-widget-scale') {
                    this._updateStyle();
                } else if (key === 'desktop-widget-show-chart') {
                    this._toggleChartVisibility();
                } else if (key === 'chart-style') {
                    if (this._chartData) {
                        this._chartCanvas.queue_repaint();
                    }
                } else if (key === 'custom-stock-names' || key === 'watchlist-label-order') {
                    this._updateData();
                } else if (key === 'format-large-prices') {
                    this._updateData();
                }
            },
            this
        );
        
        // Setup drag handling
        this._setupDragHandling();
    }
    
    _buildUI() {
        const scale = this._scale;
        const quote = SharedData.getQuote(this._symbol);
        
        // Header with drag handle
        const header = new St.BoxLayout({
            style_class: 'stockbar-widget-header'
        });
        
        // Logo
        this._logoIcon = isFxSymbol(this._symbol, quote)
            ? createFxLabel(this._symbol, quote, Math.round(14 * scale))
            : new St.Icon({
                icon_name: 'view-grid-symbolic',
                icon_size: Math.round(28 * scale)
            });
        header.add_child(this._logoIcon);
        
        // Load logo
        if (!isFxSymbol(this._symbol, quote)) {
            const logoUrl = this._api?.getLogoUrl(this._symbol, quote?.name);
            if (logoUrl && this._logoCache) {
                this._logoCache.loadLogo(this._symbol, logoUrl, (gicon) => {
                    if (gicon && this._logoIcon instanceof St.Icon) {
                        this._logoIcon.set_gicon(gicon);
                    }
                });
            }
        }
        
        // Info
        const infoBox = new St.BoxLayout({
            vertical: true,
            x_expand: true
        });
        this._infoBox = infoBox;
        
        const isCrypto = quote?.isCrypto || this._symbol.endsWith('-USD');
        let cleanSymbol = quote?.displaySymbol || this._symbol;
        if (isCrypto && cleanSymbol.endsWith('-USD')) {
            cleanSymbol = cleanSymbol.replace('-USD', '');
        }
        const displaySymbol = isCrypto ? `₿ ${cleanSymbol}` : cleanSymbol;
        const displayName = getCustomName(this._settings, this._symbol, quote?.name || 'Loading...');
        const isNameFirst = this._settings.get_string('watchlist-label-order') === LABEL_ORDER_NAME_FIRST;
        
        this._symbolLabel = new St.Label({
            text: displaySymbol,
            style_class: `stockbar-widget-symbol-label ${getFontSizeClass(isNameFirst ? 10 * scale : 14 * scale)}`
        });
        
        this._nameLabel = new St.Label({
            text: displayName,
            style_class: `stockbar-widget-name ${getFontSizeClass(isNameFirst ? 14 * scale : 10 * scale)}`
        });
        infoBox.add_child(this._symbolLabel);
        infoBox.add_child(this._nameLabel);

        this._applyWidgetLabelOrder(scale, isNameFirst);
        
        header.add_child(infoBox);
        
        // Price
        const priceBox = new St.BoxLayout({
            vertical: true
        });
        
        this._priceLabel = new St.Label({
            text: quote ? formatCurrency(quote.price, quote.currency, this._settings.get_boolean('format-large-prices')) : '--',
            style_class: `stockbar-widget-price-label ${getFontSizeClass(16 * scale)}`
        });
        priceBox.add_child(this._priceLabel);
        
        const changeValue = quote ? quote.change : 0;
        const changeClass = getChangeClass(changeValue);
        this._changeLabel = new St.Label({
            text: quote ? `${quote.change >= 0 ? '+' : ''}${quote.change.toFixed(2)} (${quote.changePercent.toFixed(2)}%)` : '--',
            style_class: `stockbar-widget-change-label ${getFontSizeClass(10 * scale)} ${changeClass}`
        });
        priceBox.add_child(this._changeLabel);
        
        header.add_child(priceBox);
        
        this.add_child(header);
        
        // Time range buttons
        const rangeBox = new St.BoxLayout({
            style_class: 'stockbar-widget-range-box'
        });
        
        const ranges = [
            { label: '1D', range: '1d', interval: '5m' },
            { label: '5D', range: '5d', interval: '15m' },
            { label: '1M', range: '1mo', interval: '1d' },
            { label: '3M', range: '3mo', interval: '1d' },
            { label: '6M', range: '6mo', interval: '1d' },
            { label: '1Y', range: '1y', interval: '1wk' }
        ];
        
        this._rangeButtons = [];
        this._selectedRange = this._loadSelectedRange();
        
        for (const r of ranges) {
            const sizeClass = getFontSizeClass(9 * scale);
            const btn = new St.Button({
                label: r.label,
                reactive: true,
                can_focus: true,
                track_hover: true,
                style_class: `stockbar-widget-range-button ${sizeClass}`
            });
            btn._sizeClass = sizeClass;
            btn._rangeData = r;
            btn.connect('clicked', () => {
                this._selectedRange = r;
                this._saveSelectedRange(r);
                this._loadChart(r.range, r.interval);
                this._highlightRangeButton(btn);
            });
            rangeBox.add_child(btn);
            this._rangeButtons.push(btn);
            
            // Highlight if this is the selected range
            if (r.range === this._selectedRange.range) {
                this._highlightRangeButton(btn);
            }
        }
        
        this.add_child(rangeBox);
        
        // Chart (if enabled)
        const showChart = this._settings.get_boolean('desktop-widget-show-chart');
        
        this._chartContainer = new St.BoxLayout({
            vertical: true,
            visible: showChart,
            style_class: 'stockbar-widget-chart-container'
        });
        
        this._chartCanvas = new St.DrawingArea({
            style_class: 'stockbar-widget-chart-canvas'
        });
        this._chartCanvas.connect('repaint', (area) => this._drawChart(area));
        this._chartContainer.add_child(this._chartCanvas);
        
        // Chart info
        this._chartInfoLabel = new St.Label({
            text: 'Loading...',
            style_class: `stockbar-widget-chart-info ${getFontSizeClass(9 * scale)}`
        });
        this._chartContainer.add_child(this._chartInfoLabel);
        
        this.add_child(this._chartContainer);
        
        // Stats row
        const statsBox = new St.BoxLayout({
            style_class: 'stockbar-widget-stats-box'
        });
        
        this._highLabel = new St.Label({
            text: 'H: --',
            style_class: `stockbar-widget-stat-high ${getFontSizeClass(9 * scale)}`
        });
        statsBox.add_child(this._highLabel);
        
        this._lowLabel = new St.Label({
            text: 'L: --',
            style_class: `stockbar-widget-stat-low ${getFontSizeClass(9 * scale)}`
        });
        statsBox.add_child(this._lowLabel);
        
        this._volumeLabel = new St.Label({
            text: 'Vol: --',
            style_class: `stockbar-widget-stat-volume ${getFontSizeClass(9 * scale)}`
        });
        statsBox.add_child(this._volumeLabel);
        
        this.add_child(statsBox);
    }

    _applyWidgetLabelOrder(scale, isNameFirst) {
        if (!this._infoBox || !this._symbolLabel || !this._nameLabel) {
            return;
        }

        this._symbolLabel.style_class = `stockbar-widget-symbol-label ${getFontSizeClass(isNameFirst ? 10 * scale : 14 * scale)}`;
        this._nameLabel.style_class = `stockbar-widget-name ${getFontSizeClass(isNameFirst ? 14 * scale : 10 * scale)}`;

        this._infoBox.remove_child(this._symbolLabel);
        this._infoBox.remove_child(this._nameLabel);

        if (isNameFirst) {
            this._infoBox.add_child(this._nameLabel);
            this._infoBox.add_child(this._symbolLabel);
        } else {
            this._infoBox.add_child(this._symbolLabel);
            this._infoBox.add_child(this._nameLabel);
        }
    }
    
    _setupDragHandling() {
        this.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 1) {
                // Check if click is on a button - if so, let it through
                const [x, y] = event.get_coords();
                const targetActor = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
                
                // If the target is a button or inside a button, don't start dragging
                let checkActor = targetActor;
                while (checkActor && checkActor !== this) {
                    if (checkActor instanceof St.Button) {
                        return Clutter.EVENT_PROPAGATE;
                    }
                    checkActor = checkActor.get_parent();
                }
                
                this._dragging = true;
                [this._dragStartX, this._dragStartY] = event.get_coords();
                [this._widgetStartX, this._widgetStartY] = this.get_position();
                global.stage.set_key_focus(null);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        
        this.connect('button-release-event', (actor, event) => {
            if (event.get_button() === 1 && this._dragging) {
                this._dragging = false;
                this._savePosition();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        
        this.connect('motion-event', (actor, event) => {
            if (this._dragging) {
                const [currentX, currentY] = event.get_coords();
                const deltaX = currentX - this._dragStartX;
                const deltaY = currentY - this._dragStartY;
                this.set_position(
                    Math.round(this._widgetStartX + deltaX),
                    Math.round(this._widgetStartY + deltaY)
                );
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        
        this.connect('leave-event', () => {
            if (this._dragging) {
                this._dragging = false;
                this._savePosition();
            }
        });
    }
    
    _loadPosition() {
        try {
            const positions = JSON.parse(this._settings.get_string('desktop-widget-positions') || '{}');
            if (positions[this._symbol]) {
                const pos = positions[this._symbol];
                this.set_position(pos.x, pos.y);
            } else {
                // Default position: top-left with offset for multiple widgets
                const monitor = Main.layoutManager.primaryMonitor;
                const desktopWidgets = this._settings.get_strv('desktop-widgets');
                const index = desktopWidgets.indexOf(this._symbol);
                const offsetX = 20 + (index * 20);
                const offsetY = 80 + (index * 20);
                this.set_position(monitor.x + offsetX, monitor.y + offsetY);
            }
        } catch (e) {
            console.debug(`GNOME Stocks: Error loading widget position: ${e.message}`);
        }
    }
    
    _savePosition() {
        try {
            const positions = JSON.parse(this._settings.get_string('desktop-widget-positions') || '{}');
            const [x, y] = this.get_position();
            positions[this._symbol] = { x, y };
            this._settings.set_string('desktop-widget-positions', JSON.stringify(positions));
        } catch (e) {
            console.debug(`GNOME Stocks: Error saving widget position: ${e.message}`);
        }
    }
    
    _loadSelectedRange() {
        try {
            const positions = JSON.parse(this._settings.get_string('desktop-widget-positions') || '{}');
            if (positions[this._symbol]?.rangeData) {
                return positions[this._symbol].rangeData;
            }
        } catch (e) {
            console.debug(`GNOME Stocks: Error loading widget range: ${e.message}`);
        }
        return { range: '1mo', interval: '1d' };
    }
    
    _saveSelectedRange(rangeData) {
        try {
            const positions = JSON.parse(this._settings.get_string('desktop-widget-positions') || '{}');
            if (!positions[this._symbol]) {
                positions[this._symbol] = {};
            }
            positions[this._symbol].rangeData = { range: rangeData.range, interval: rangeData.interval };
            this._settings.set_string('desktop-widget-positions', JSON.stringify(positions));
        } catch (e) {
            console.debug(`GNOME Stocks: Error saving widget range: ${e.message}`);
        }
    }
    
    _highlightRangeButton(activeBtn) {
        for (const btn of this._rangeButtons) {
            if (btn === activeBtn) {
                btn.style_class = `stockbar-widget-range-button-active ${btn._sizeClass || ''}`.trim();
            } else {
                btn.style_class = `stockbar-widget-range-button ${btn._sizeClass || ''}`.trim();
            }
        }
    }
    
    _updateStyle() {
        const opacity = this._settings.get_int('desktop-widget-opacity');
        const scale = this._settings.get_double('desktop-widget-scale');
        this._scale = scale;
        const opacityClass = getWidgetOpacityClass(opacity);
        const scaleClass = getWidgetScaleClass(scale);
        this.style_class = `stockbar-desktop-widget ${opacityClass} ${scaleClass}`;

        const isNameFirst = this._settings.get_string('watchlist-label-order') === LABEL_ORDER_NAME_FIRST;
        this._applyWidgetLabelOrder(scale, isNameFirst);

        if (this._priceLabel) {
            this._priceLabel.style_class = `stockbar-widget-price-label ${getFontSizeClass(16 * scale)}`;
        }
        if (this._changeLabel) {
            const quote = SharedData.getQuote(this._symbol);
            const changeValue = quote?.change ?? 0;
            const changeClass = getChangeClass(changeValue);
            this._changeLabel.style_class = `stockbar-widget-change-label ${getFontSizeClass(10 * scale)} ${changeClass}`;
        }
        if (this._chartInfoLabel) {
            let chartClass = `stockbar-widget-chart-info ${getFontSizeClass(9 * scale)}`;
            if (this._chartData?.prices?.length) {
                const prices = this._chartData.prices.map(p => p.close || p.price || p);
                const changeValue = prices[prices.length - 1] - prices[0];
                chartClass = `${chartClass} ${getChangeClass(changeValue)}`;
            }
            this._chartInfoLabel.style_class = chartClass;
        }
        if (this._highLabel) {
            this._highLabel.style_class = `stockbar-widget-stat-high ${getFontSizeClass(9 * scale)}`;
        }
        if (this._lowLabel) {
            this._lowLabel.style_class = `stockbar-widget-stat-low ${getFontSizeClass(9 * scale)}`;
        }
        if (this._volumeLabel) {
            this._volumeLabel.style_class = `stockbar-widget-stat-volume ${getFontSizeClass(9 * scale)}`;
        }

        if (this._rangeButtons?.length) {
            for (const btn of this._rangeButtons) {
                btn._sizeClass = getFontSizeClass(9 * scale);
            }
            const activeBtn = this._rangeButtons.find(btn => btn._rangeData?.range === this._selectedRange?.range);
            if (activeBtn) {
                this._highlightRangeButton(activeBtn);
            }
        }
    }
    
    _toggleChartVisibility() {
        const showChart = this._settings.get_boolean('desktop-widget-show-chart');
        this._chartContainer.visible = showChart;
    }
    
    _updateData() {
        const quote = SharedData.getQuote(this._symbol);
        if (!quote) return;
        
        const isCrypto = quote.isCrypto || this._symbol.endsWith('-USD');
        let cleanSymbol = quote.displaySymbol || this._symbol;
        if (isCrypto && cleanSymbol.endsWith('-USD')) {
            cleanSymbol = cleanSymbol.replace('-USD', '');
        }
        const displaySymbol = isCrypto ? `₿ ${cleanSymbol}` : cleanSymbol;
        const displayName = getCustomName(this._settings, this._symbol, quote.name || '');
        const isNameFirst = this._settings.get_string('watchlist-label-order') === LABEL_ORDER_NAME_FIRST;
        
        this._symbolLabel.set_text(displaySymbol);
        this._nameLabel.set_text(displayName);
        this._applyWidgetLabelOrder(this._scale, isNameFirst);
        this._priceLabel.set_text(formatCurrency(quote.price, quote.currency, this._settings.get_boolean('format-large-prices')));
        
        this._changeLabel.set_text(`${quote.change >= 0 ? '+' : ''}${quote.change.toFixed(2)} (${quote.changePercent.toFixed(2)}%)`);
        this._changeLabel.style_class = `stockbar-widget-change-label ${getFontSizeClass(10 * this._scale)} ${getChangeClass(quote.change)}`;
    }
    
    async _loadChart(range = '1mo', interval = '1d') {
        // Ensure API is available
        if (!this._api) {
            this._api = SharedData.api;
        }
        
        if (!this._api) {
            console.debug(`GNOME Stocks: API not available for desktop widget chart`);
            this._chartInfoLabel.set_text('Chart unavailable - API not ready');
            return;
        }
        
        // Update the info label to show loading
        this._chartInfoLabel.set_text('Loading chart...');
        
        try {
            const data = await this._api.getChartData(this._symbol, range, interval);
            if (data && data.prices && data.prices.length > 0) {
                this._chartData = data;
                this._chartCanvas.queue_repaint();
                
                // Update stats
                const prices = data.prices.map(p => p.close || p.price || p);
                const high = Math.max(...prices);
                const low = Math.min(...prices);
                
                this._highLabel.set_text(`H: $${high.toFixed(2)}`);
                this._lowLabel.set_text(`L: $${low.toFixed(2)}`);
                
                if (data.volume) {
                    this._volumeLabel.set_text(`Vol: ${this._formatVolume(data.volume)}`);
                }
                
                // Calculate change
                const firstPrice = prices[0];
                const lastPrice = prices[prices.length - 1];
                const change = lastPrice - firstPrice;
                const changePercent = (change / firstPrice) * 100;
                this._chartInfoLabel.set_text(`Change: ${change >= 0 ? '+' : ''}$${change.toFixed(2)} (${change >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)`);
                this._chartInfoLabel.style_class = `stockbar-widget-chart-info ${getFontSizeClass(9 * this._scale)} ${getChangeClass(change)}`;
            }
        } catch (e) {
            console.debug(`GNOME Stocks: Error loading chart for desktop widget: ${e.message}`);
            this._chartInfoLabel.set_text('Chart unavailable');
        }
    }
    
    _drawChart(area) {
        if (!this._chartData || !this._chartData.prices) return;
        
        const cr = area.get_context();
        const [width, height] = area.get_surface_size();
        
        const priceData = this._chartData.prices;
        const prices = priceData.map(p => p.close || p.price || p);
        
        if (prices.length < 2) return;
        
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const range = max - min || 1;
        
        const padding = { left: 4, right: 4, top: 4, bottom: 4 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        
        const isUp = prices[prices.length - 1] >= prices[0];
        const lineColor = isUp ? [0.298, 0.686, 0.314, 1] : [0.957, 0.263, 0.212, 1];
        const fillColor = isUp ? [0.298, 0.686, 0.314, 0.2] : [0.957, 0.263, 0.212, 0.2];
        
        const chartStyle = this._settings.get_string('chart-style');
        
        if (chartStyle === 'candle' && priceData[0].open !== undefined) {
            this._drawCandleChart(cr, priceData, padding, chartWidth, chartHeight, min, range);
        } else if (chartStyle === 'bar') {
            this._drawBarChart(cr, prices, padding, chartWidth, chartHeight, min, range, lineColor, fillColor);
        } else {
            this._drawLineChart(cr, prices, padding, chartWidth, chartHeight, min, range, lineColor, fillColor);
        }
    }
    
    _drawLineChart(cr, prices, padding, chartWidth, chartHeight, min, range, lineColor, fillColor) {
        const stepX = chartWidth / (prices.length - 1);
        
        // Draw filled area
        cr.setSourceRGBA(...fillColor);
        cr.moveTo(padding.left, padding.top + chartHeight);
        
        for (let i = 0; i < prices.length; i++) {
            const x = padding.left + stepX * i;
            const y = padding.top + chartHeight - ((prices[i] - min) / range) * chartHeight;
            cr.lineTo(x, y);
        }
        
        cr.lineTo(padding.left + chartWidth, padding.top + chartHeight);
        cr.closePath();
        cr.fill();
        
        // Draw line
        cr.setSourceRGBA(...lineColor);
        cr.setLineWidth(1.5);
        
        cr.moveTo(padding.left, padding.top + chartHeight - ((prices[0] - min) / range) * chartHeight);
        for (let i = 1; i < prices.length; i++) {
            const x = padding.left + stepX * i;
            const y = padding.top + chartHeight - ((prices[i] - min) / range) * chartHeight;
            cr.lineTo(x, y);
        }
        cr.stroke();
    }
    
    _drawBarChart(cr, prices, padding, chartWidth, chartHeight, min, range, lineColor, fillColor) {
        const barWidth = Math.max(2, (chartWidth / prices.length) - 1);
        const stepX = chartWidth / prices.length;
        
        for (let i = 0; i < prices.length; i++) {
            const x = padding.left + stepX * i;
            const barHeight = ((prices[i] - min) / range) * chartHeight;
            const y = padding.top + chartHeight - barHeight;
            
            cr.setSourceRGBA(...lineColor);
            cr.rectangle(x, y, barWidth, barHeight);
            cr.fill();
        }
    }
    
    _drawCandleChart(cr, priceData, padding, chartWidth, chartHeight, min, range) {
        const candleWidth = Math.max(2, (chartWidth / priceData.length) - 1);
        const stepX = chartWidth / priceData.length;
        
        for (let i = 0; i < priceData.length; i++) {
            const p = priceData[i];
            if (!p.open || !p.close || !p.high || !p.low) continue;
            
            const x = padding.left + stepX * i;
            const isUp = p.close >= p.open;
            const color = isUp ? [0.298, 0.686, 0.314, 1] : [0.957, 0.263, 0.212, 1];
            cr.setSourceRGBA(...color);
            
            const highY = padding.top + chartHeight - ((p.high - min) / range) * chartHeight;
            const lowY = padding.top + chartHeight - ((p.low - min) / range) * chartHeight;
            const wickX = x + candleWidth / 2;
            
            cr.setLineWidth(1);
            cr.moveTo(wickX, highY);
            cr.lineTo(wickX, lowY);
            cr.stroke();
            
            const openY = padding.top + chartHeight - ((p.open - min) / range) * chartHeight;
            const closeY = padding.top + chartHeight - ((p.close - min) / range) * chartHeight;
            const bodyTop = Math.min(openY, closeY);
            const bodyHeight = Math.max(Math.abs(closeY - openY), 1);
            
            cr.rectangle(x, bodyTop, candleWidth, bodyHeight);
            cr.fill();
        }
    }
    
    _formatVolume(vol) {
        if (vol >= 1e9) return `${(vol / 1e9).toFixed(1)}B`;
        if (vol >= 1e6) return `${(vol / 1e6).toFixed(1)}M`;
        if (vol >= 1e3) return `${(vol / 1e3).toFixed(1)}K`;
        return vol.toString();
    }
    
    _unpinFromDesktop() {
        const desktopWidgets = this._settings.get_strv('desktop-widgets');
        const index = desktopWidgets.indexOf(this._symbol);
        if (index !== -1) {
            desktopWidgets.splice(index, 1);
            this._settings.set_strv('desktop-widgets', desktopWidgets);
        }
    }
    
    destroy() {
        if (this._initTimeout) {
            GLib.source_remove(this._initTimeout);
            this._initTimeout = null;
        }
        
        SharedData.removeListener(this._updateCallback);
        
        this._settings.disconnectObject(this);
        
        super.destroy();
    }
});