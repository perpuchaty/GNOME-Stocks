import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import {StockAPI} from './stockApi.js';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class GNOMEStocksPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const api = new StockAPI();

        // Create a preferences page
        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        // Appearance group
        const appearanceGroup = new Adw.PreferencesGroup({
            title: _('Appearance'),
            description: _('Customize the look of GNOME Stocks'),
        });
        page.add(appearanceGroup);

        // Panel position
        const positionRow = new Adw.ComboRow({
            title: _('Panel Position'),
            subtitle: _('Where to place the indicator in the panel'),
        });

        const positionModel = new Gtk.StringList();
        positionModel.append(_('Left'));
        positionModel.append(_('Center'));
        positionModel.append(_('Right'));
        positionRow.model = positionModel;

        // Map setting value to combo index
        const positionMap = { 'left': 0, 'center': 1, 'right': 2 };
        const reversePositionMap = ['left', 'center', 'right'];
        positionRow.selected = positionMap[settings.get_string('panel-position')] ?? 2;

        positionRow.connect('notify::selected', () => {
            settings.set_string('panel-position', reversePositionMap[positionRow.selected]);
        });

        appearanceGroup.add(positionRow);

        // Font size
        const fontSizeRow = new Adw.SpinRow({
            title: _('Font Size'),
            subtitle: _('Font size for the popup menu (8-24)'),
            adjustment: new Gtk.Adjustment({
                lower: 8,
                upper: 24,
                step_increment: 1,
                page_increment: 2,
                value: settings.get_int('font-size'),
            }),
        });

        settings.bind(
            'font-size',
            fontSizeRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );

        appearanceGroup.add(fontSizeRow);

        // Watchlist label order
        const labelOrderRow = new Adw.ComboRow({
            title: _('Watchlist Label Order'),
            subtitle: _('Choose which label is larger in the watchlist'),
        });

        const labelOrderModel = new Gtk.StringList();
        labelOrderModel.append(_('Symbol above Name'));
        labelOrderModel.append(_('Name above Symbol'));
        labelOrderRow.model = labelOrderModel;

        const labelOrderMap = { 'symbol-first': 0, 'name-first': 1 };
        const reverseLabelOrderMap = ['symbol-first', 'name-first'];
        labelOrderRow.selected = labelOrderMap[settings.get_string('watchlist-label-order')] ?? 0;

        labelOrderRow.connect('notify::selected', () => {
            settings.set_string('watchlist-label-order', reverseLabelOrderMap[labelOrderRow.selected]);
        });

        appearanceGroup.add(labelOrderRow);

        // Show secondary watchlist label
        const showSecondaryLabelRow = new Adw.SwitchRow({
            title: _('Show Secondary Label'),
            subtitle: _('Show or hide the smaller line in watchlist items'),
        });

        settings.bind(
            'watchlist-show-secondary-label',
            showSecondaryLabelRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        appearanceGroup.add(showSecondaryLabelRow);

        // Chart style
        const chartStyleRow = new Adw.ComboRow({
            title: _('Chart Style'),
            subtitle: _('Choose how charts are displayed'),
        });

        const chartStyleModel = new Gtk.StringList();
        chartStyleModel.append(_('Line Chart'));
        chartStyleModel.append(_('Bar Chart'));
        chartStyleModel.append(_('Candle Chart'));
        chartStyleRow.model = chartStyleModel;

        // Map setting value to combo index
        const chartStyleMap = { 'line': 0, 'bar': 1, 'candle': 2 };
        const reverseChartStyleMap = ['line', 'bar', 'candle'];
        chartStyleRow.selected = chartStyleMap[settings.get_string('chart-style')] ?? 0;

        chartStyleRow.connect('notify::selected', () => {
            settings.set_string('chart-style', reverseChartStyleMap[chartStyleRow.selected]);
        });

        appearanceGroup.add(chartStyleRow);

        // Show main icon
        const showIconRow = new Adw.SwitchRow({
            title: _('Show Extension Icon'),
            subtitle: _('Show or hide the main menu icon in the top bar'),
        });

        settings.bind(
            'show-icon',
            showIconRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        appearanceGroup.add(showIconRow);

        // Panel Display group
        const panelDisplayGroup = new Adw.PreferencesGroup({
            title: _('Panel Display'),
            description: _('Customize what appears on panel stock buttons'),
        });
        page.add(panelDisplayGroup);

        // Show stock icon
        const showStockIconRow = new Adw.SwitchRow({
            title: _('Show Stock Icon'),
            subtitle: _('Display company logo/icon on panel buttons'),
        });

        settings.bind(
            'show-stock-icon',
            showStockIconRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        panelDisplayGroup.add(showStockIconRow);

        // Show stock name
        const showStockNameRow = new Adw.SwitchRow({
            title: _('Show Stock Name'),
            subtitle: _('Display stock symbol/ticker on panel buttons'),
        });

        settings.bind(
            'show-stock-name',
            showStockNameRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        panelDisplayGroup.add(showStockNameRow);

        // Show stock price
        const showStockPriceRow = new Adw.SwitchRow({
            title: _('Show Stock Price'),
            subtitle: _('Display current price on panel buttons'),
        });

        settings.bind(
            'show-stock-price',
            showStockPriceRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        panelDisplayGroup.add(showStockPriceRow);

        // Show stock gain
        const showStockGainRow = new Adw.SwitchRow({
            title: _('Show Stock Gain'),
            subtitle: _('Display price change/percentage on panel buttons'),
        });

        settings.bind(
            'show-stock-gain',
            showStockGainRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        panelDisplayGroup.add(showStockGainRow);

        // Desktop Widget settings group
        const desktopWidgetGroup = new Adw.PreferencesGroup({
            title: _('Desktop Widgets'),
            description: _('Configure desktop stock widgets (pin stocks from the menu)'),
        });
        page.add(desktopWidgetGroup);

        // Widget opacity
        const widgetOpacityRow = new Adw.SpinRow({
            title: _('Widget Opacity'),
            subtitle: _('Background opacity of desktop widgets (0-100%)'),
            adjustment: new Gtk.Adjustment({
                lower: 10,
                upper: 100,
                step_increment: 5,
                page_increment: 10,
                value: settings.get_int('desktop-widget-opacity'),
            }),
        });

        settings.bind(
            'desktop-widget-opacity',
            widgetOpacityRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );

        desktopWidgetGroup.add(widgetOpacityRow);

        // Widget scale
        const widgetScaleRow = new Adw.SpinRow({
            title: _('Widget Scale'),
            subtitle: _('Size multiplier for desktop widgets (0.5-2.0)'),
            adjustment: new Gtk.Adjustment({
                lower: 0.5,
                upper: 2.0,
                step_increment: 0.1,
                page_increment: 0.25,
                value: settings.get_double('desktop-widget-scale'),
            }),
            digits: 1,
        });

        settings.bind(
            'desktop-widget-scale',
            widgetScaleRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );

        desktopWidgetGroup.add(widgetScaleRow);

        // Show chart in widget
        const widgetShowChartRow = new Adw.SwitchRow({
            title: _('Show Chart'),
            subtitle: _('Display price chart in desktop widgets'),
        });

        settings.bind(
            'desktop-widget-show-chart',
            widgetShowChartRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        desktopWidgetGroup.add(widgetShowChartRow);

        // Refresh settings group
        const refreshGroup = new Adw.PreferencesGroup({
            title: _('Data'),
            description: _('Stock data settings'),
        });
        page.add(refreshGroup);

        // Custom stock names
        const customNamesGroup = new Adw.PreferencesGroup({
            title: _('Custom Stock Names'),
            description: _('Override company names shown in the watchlist'),
        });
        page.add(customNamesGroup);

        const rebuildCustomNames = async () => {
            let child = customNamesGroup.get_first_child();
            while (child) {
                const next = child.get_next_sibling();
                customNamesGroup.remove(child);
                child = next;
            }

            const watchlist = settings.get_strv('watchlist');
            if (watchlist.length === 0) {
                const emptyRow = new Adw.ActionRow({
                    title: _('No watchlist items yet'),
                    subtitle: _('Add stocks to the watchlist to customize their names.'),
                });
                customNamesGroup.add(emptyRow);
                return;
            }

            const nameMap = {};
            try {
                const quotes = await api.getMultipleQuotes(watchlist);
                for (const quote of quotes) {
                    if (!quote.error) {
                        nameMap[quote.symbol] = quote.name || quote.displaySymbol || quote.symbol;
                    }
                }
            } catch (e) {
                console.debug(`GNOME Stocks: Error loading names for prefs: ${e.message}`);
            }

            let customNames = {};
            try {
                customNames = JSON.parse(settings.get_string('custom-stock-names') || '{}');
            } catch {
                customNames = {};
            }

            for (const symbol of watchlist) {
                const companyName = nameMap[symbol] || symbol;
                const title = companyName === symbol ? symbol : `${symbol} - ${companyName}`;
                const entryRow = new Adw.EntryRow({
                    title: title,
                    text: customNames[symbol] || '',
                });

                entryRow.connect('changed', () => {
                    const updatedNames = {...customNames};
                    const newValue = entryRow.get_text().trim();

                    if (newValue.length === 0) {
                        delete updatedNames[symbol];
                    } else {
                        updatedNames[symbol] = newValue;
                    }

                    settings.set_string('custom-stock-names', JSON.stringify(updatedNames));
                    customNames = updatedNames;
                });

                customNamesGroup.add(entryRow);
            }
        };

        rebuildCustomNames();
        settings.connect('changed::watchlist', rebuildCustomNames);

        // Refresh interval
        const refreshRow = new Adw.SpinRow({
            title: _('Refresh Interval'),
            subtitle: _('How often to update stock prices (in seconds)'),
            adjustment: new Gtk.Adjustment({
                lower: 10,
                upper: 600,
                step_increment: 10,
                page_increment: 60,
                value: settings.get_int('refresh-interval'),
            }),
        });

        settings.bind(
            'refresh-interval',
            refreshRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );

        refreshGroup.add(refreshRow);

        // Watchlist group
        const watchlistGroup = new Adw.PreferencesGroup({
            title: _('Watchlist'),
            description: _('Search and manage your watched stocks'),
        });
        page.add(watchlistGroup);

        // Search row
        const searchRow = new Adw.EntryRow({
            title: _('Search for stocks...'),
        });

        const searchButton = new Gtk.Button({
            label: _('Search'),
            valign: Gtk.Align.CENTER,
            css_classes: ['suggested-action'],
        });

        searchRow.add_suffix(searchButton);
        searchRow.activatable_widget = searchButton;
        watchlistGroup.add(searchRow);

        // Search results group
        const searchResultsGroup = new Adw.PreferencesGroup({
            title: _('Search Results'),
        });
        searchResultsGroup.visible = false;
        page.add(searchResultsGroup);

        // Watchlist list group
        const watchlistListGroup = new Adw.PreferencesGroup({
            title: _('Your Watchlist'),
        });
        page.add(watchlistListGroup);

        const searchResultRows = [];
        const watchlistRows = [];

        const clearRows = (group, rows) => {
            for (const row of rows) {
                group.remove(row);
            }
            rows.length = 0;
        };

        const addToWatchlist = (symbol) => {
            const watchlist = settings.get_strv('watchlist');
            if (!watchlist.includes(symbol)) {
                watchlist.push(symbol);
                settings.set_strv('watchlist', watchlist);
            }
        };

        const removeFromWatchlist = (symbol) => {
            const watchlist = settings.get_strv('watchlist').filter(s => s !== symbol);
            const panelStocks = settings.get_strv('panel-stocks').filter(s => s !== symbol);
            settings.set_strv('watchlist', watchlist);
            settings.set_strv('panel-stocks', panelStocks);
        };

        const setPanelVisibility = (symbol, shouldShow) => {
            const panelStocks = settings.get_strv('panel-stocks');
            const exists = panelStocks.includes(symbol);

            if (shouldShow && !exists) {
                panelStocks.push(symbol);
            } else if (!shouldShow && exists) {
                panelStocks.splice(panelStocks.indexOf(symbol), 1);
            }

            settings.set_strv('panel-stocks', panelStocks);
        };

        const addInfoRow = (group, rows, title, subtitle = '') => {
            const infoRow = new Adw.ActionRow({
                title,
                subtitle,
            });
            group.add(infoRow);
            rows.push(infoRow);
        };

        const renderSearchResults = (results, query) => {
            clearRows(searchResultsGroup, searchResultRows);
            searchResultsGroup.visible = true;

            if (!results || results.length === 0) {
                addInfoRow(searchResultsGroup, searchResultRows, _('No results found'));

                if (query.length >= 1 && query.length <= 10 && /^[A-Za-z0-9.^]+$/.test(query)) {
                    const directSymbol = query.toUpperCase();
                    const directRow = new Adw.ActionRow({
                        title: _('Add “%s”').format(directSymbol),
                        subtitle: _('Add this symbol directly'),
                    });
                    const addButton = new Gtk.Button({
                        label: _('Add'),
                        valign: Gtk.Align.CENTER,
                        css_classes: ['suggested-action'],
                    });
                    addButton.connect('clicked', () => {
                        addToWatchlist(directSymbol);
                    });
                    directRow.add_suffix(addButton);
                    directRow.activatable_widget = addButton;
                    searchResultsGroup.add(directRow);
                    searchResultRows.push(directRow);
                }
                return;
            }

            for (const stock of results.slice(0, 10)) {
                const row = new Adw.ActionRow({
                    title: stock.displaySymbol || stock.symbol,
                    subtitle: stock.name || stock.symbol,
                });

                const addButton = new Gtk.Button({
                    label: _('Add'),
                    valign: Gtk.Align.CENTER,
                    css_classes: ['suggested-action'],
                });
                addButton.connect('clicked', () => {
                    addToWatchlist(stock.symbol);
                });

                row.add_suffix(addButton);
                row.activatable_widget = addButton;
                searchResultsGroup.add(row);
                searchResultRows.push(row);
            }
        };

        const renderWatchlist = () => {
            clearRows(watchlistListGroup, watchlistRows);

            const watchlist = settings.get_strv('watchlist');
            const panelStocks = settings.get_strv('panel-stocks');

            if (watchlist.length === 0) {
                addInfoRow(watchlistListGroup, watchlistRows, _('No stocks in watchlist'), _('Add stocks above'));
                return;
            }

            for (const symbol of watchlist) {
                const row = new Adw.ActionRow({
                    title: symbol,
                    subtitle: panelStocks.includes(symbol) ? _('Shown in panel') : _('In watchlist only'),
                });

                const panelSwitch = new Gtk.Switch({
                    active: panelStocks.includes(symbol),
                    valign: Gtk.Align.CENTER,
                });
                panelSwitch.connect('notify::active', () => {
                    setPanelVisibility(symbol, panelSwitch.active);
                });

                const removeButton = new Gtk.Button({
                    icon_name: 'user-trash-symbolic',
                    valign: Gtk.Align.CENTER,
                    css_classes: ['destructive-action'],
                });
                removeButton.connect('clicked', () => {
                    removeFromWatchlist(symbol);
                });

                row.add_suffix(panelSwitch);
                row.add_suffix(removeButton);
                watchlistListGroup.add(row);
                watchlistRows.push(row);
            }

            const clearRow = new Adw.ActionRow({
                title: _('Clear All'),
                subtitle: _('Remove all stocks from watchlist'),
            });

            const clearButton = new Gtk.Button({
                label: _('Clear'),
                valign: Gtk.Align.CENTER,
                css_classes: ['destructive-action'],
            });

            clearButton.connect('clicked', () => {
                settings.set_strv('watchlist', []);
                settings.set_strv('panel-stocks', []);
            });

            clearRow.add_suffix(clearButton);
            watchlistListGroup.add(clearRow);
            watchlistRows.push(clearRow);
        };

        const performSearch = async () => {
            const query = (searchRow.text || '').trim();
            if (!query) {
                searchResultsGroup.visible = false;
                clearRows(searchResultsGroup, searchResultRows);
                return;
            }

            clearRows(searchResultsGroup, searchResultRows);
            searchResultsGroup.visible = true;
            addInfoRow(searchResultsGroup, searchResultRows, _('Searching...'));

            try {
                const results = await api.searchStocks(query);
                renderSearchResults(results, query);
            } catch (e) {
                clearRows(searchResultsGroup, searchResultRows);
                addInfoRow(searchResultsGroup, searchResultRows, _('Search unavailable'));
            }
        };

        searchRow.connect('activate', () => {
            performSearch();
        });
        searchButton.connect('clicked', () => {
            performSearch();
        });

        settings.connect('changed::watchlist', () => {
            renderWatchlist();
        });
        settings.connect('changed::panel-stocks', () => {
            renderWatchlist();
        });

        renderWatchlist();

        // About group
        const aboutGroup = new Adw.PreferencesGroup({
            title: _('About'),
        });
        page.add(aboutGroup);

        const aboutRow = new Adw.ActionRow({
            title: _('GNOME Stocks'),
            subtitle: _('Stock market tracker for GNOME Shell'),
        });
        aboutGroup.add(aboutRow);

        const versionRow = new Adw.ActionRow({
            title: _('Version'),
            subtitle: '1.0',
        });
        aboutGroup.add(versionRow);
    }
}
