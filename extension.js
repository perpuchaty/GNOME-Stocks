import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {StockPopupMenu, StockPanelButton, DesktopStockWidget} from './stockPopupMenu.js';

export default class GNOMEStocksExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._indicator = null;
        this._stockButtons = new Map();
        this._desktopWidgets = new Map();
        this._indicatorAdded = false;
    }

    enable() {
        console.debug('GNOME Stocks: Enabling extension');
        
        this._settings = this.getSettings();
        this._indicator = new StockPopupMenu(this._settings, this.path);
        this._addToPanel();
        this._syncIndicatorVisibility();
        this._createStockButtons();
        this._createDesktopWidgets();

        this._settings.connectObject(
            'changed::panel-position', () => this._repositionIndicator(),
            'changed::panel-stocks', () => this._updateStockButtons(),
            'changed::show-icon', () => this._syncIndicatorVisibility(),
            'changed::desktop-widgets', () => this._updateDesktopWidgets(),
            'changed::widget-move-mode', () => this._updateWidgetMoveMode(),
            this
        );
        
        console.debug('GNOME Stocks: Extension enabled');
    }

    _addToPanel() {
        if (!this._indicator || this._indicatorAdded) return;
        const position = this._settings.get_string('panel-position');
        Main.panel.addToStatusArea('gnome-stocks-indicator', this._indicator, 0, position);
        this._indicatorAdded = true;
        console.debug('GNOME Stocks: Main indicator added to panel');
    }

    _removeFromPanel() {
        if (!this._indicator || !this._indicatorAdded) return;
        this._indicator.container.get_parent()?.remove_child(this._indicator.container);
        this._indicatorAdded = false;
        console.debug('GNOME Stocks: Main indicator removed from panel');
    }

    _syncIndicatorVisibility() {
        const shouldShow = this._settings.get_boolean('show-icon');
        console.debug(`GNOME Stocks: Syncing indicator visibility - shouldShow: ${shouldShow}, indicatorAdded: ${this._indicatorAdded}`);
        
        if (!this._indicator) return;
        
        if (shouldShow) {
            if (!this._indicatorAdded) {
                this._addToPanel();
            } else {
                this._indicator.container.show();
            }
        } else {
            if (this._indicatorAdded) {
                this._indicator.container.hide();
            }
        }
    }

    _createStockButtons() {
        const panelStocks = this._settings.get_strv('panel-stocks');
        const position = this._settings.get_string('panel-position');
        
        for (const symbol of panelStocks) {
            if (!this._stockButtons.has(symbol)) {
                const button = new StockPanelButton(symbol, this._settings, this._indicator);
                this._stockButtons.set(symbol, button);
                Main.panel.addToStatusArea(`gnome-stocks-${symbol}`, button, 1, position);
            }
        }
    }

    _updateStockButtons() {
        const panelStocks = this._settings.get_strv('panel-stocks');
        const position = this._settings.get_string('panel-position');
        
        for (const [symbol, button] of this._stockButtons) {
            if (!panelStocks.includes(symbol)) {
                button.destroy();
                this._stockButtons.delete(symbol);
            }
        }
        
        for (const symbol of panelStocks) {
            if (!this._stockButtons.has(symbol)) {
                const button = new StockPanelButton(symbol, this._settings, this._indicator);
                this._stockButtons.set(symbol, button);
                Main.panel.addToStatusArea(`gnome-stocks-${symbol}`, button, 1, position);
            }
        }
    }

    _repositionIndicator() {
        const position = this._settings.get_string('panel-position');
        
        if (this._indicator && this._indicatorAdded) {
            this._indicator.container.get_parent()?.remove_child(this._indicator.container);
            
            let box;
            switch (position) {
                case 'left':
                    box = Main.panel._leftBox;
                    break;
                case 'center':
                    box = Main.panel._centerBox;
                    break;
                case 'right':
                default:
                    box = Main.panel._rightBox;
                    break;
            }
            
            box.insert_child_at_index(this._indicator.container, 0);
        }
        
        for (const [symbol, button] of this._stockButtons) {
            button.container.get_parent()?.remove_child(button.container);
            
            let box;
            switch (position) {
                case 'left':
                    box = Main.panel._leftBox;
                    break;
                case 'center':
                    box = Main.panel._centerBox;
                    break;
                case 'right':
                default:
                    box = Main.panel._rightBox;
                    break;
            }
            
            box.insert_child_at_index(button.container, 1);
        }
    }

    _createDesktopWidgets() {
        const desktopWidgets = this._settings.get_strv('desktop-widgets');
        
        for (const symbol of desktopWidgets) {
            if (!this._desktopWidgets.has(symbol)) {
                this._createDesktopWidget(symbol);
            }
        }
    }
    
    _createDesktopWidget(symbol) {
        try {
            const api = this._indicator?._api;
            const logoCache = this._indicator?._logoCache;
            
            const widget = new DesktopStockWidget(symbol, this._settings, api, logoCache);
            const moveMode = this._settings.get_boolean('widget-move-mode');
            
            if (moveMode) {
                Main.layoutManager.uiGroup.add_child(widget);
                widget.add_style_class_name('stockbar-widget-move-mode');
            } else {
                // Keep widgets with the wallpaper so normal windows cover them.
                const bgManager = Main.layoutManager._bgManagers?.[0];
                if (bgManager && bgManager.backgroundActor) {
                    const bgParent = bgManager.backgroundActor.get_parent();
                    if (bgParent) {
                        bgParent.add_child(widget);
                    } else {
                        Main.layoutManager.uiGroup.insert_child_at_index(widget, 1);
                    }
                } else {
                    Main.layoutManager.uiGroup.insert_child_at_index(widget, 1);
                }
            }
            
            this._desktopWidgets.set(symbol, widget);
            console.debug(`GNOME Stocks: Created desktop widget for ${symbol}`);
        } catch (e) {
            console.debug(`GNOME Stocks: Error creating desktop widget for ${symbol}: ${e.message}`);
        }
    }
    
    _updateDesktopWidgets() {
        const desktopWidgets = this._settings.get_strv('desktop-widgets');
        
        for (const [symbol, widget] of this._desktopWidgets) {
            if (!desktopWidgets.includes(symbol)) {
                const parent = widget.get_parent();
                if (parent) {
                    parent.remove_child(widget);
                }
                widget.destroy();
                this._desktopWidgets.delete(symbol);
                console.debug(`GNOME Stocks: Removed desktop widget for ${symbol}`);
            }
        }
        
        for (const symbol of desktopWidgets) {
            if (!this._desktopWidgets.has(symbol)) {
                this._createDesktopWidget(symbol);
            }
        }
    }
    
    _updateWidgetMoveMode() {
        const moveMode = this._settings.get_boolean('widget-move-mode');
        
        for (const [symbol, widget] of this._desktopWidgets) {
            const currentParent = widget.get_parent();
            
            if (moveMode) {
                if (currentParent) {
                    currentParent.remove_child(widget);
                }
                Main.layoutManager.uiGroup.add_child(widget);
                Main.layoutManager.uiGroup.set_child_above_sibling(widget, null);
                widget.add_style_class_name('stockbar-widget-move-mode');
                widget.ease({
                    opacity: 255,
                    duration: 200,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD
                });
            } else {
                if (currentParent) {
                    currentParent.remove_child(widget);
                }
                widget.remove_style_class_name('stockbar-widget-move-mode');

                const bgManager = Main.layoutManager._bgManagers?.[0];
                if (bgManager && bgManager.backgroundActor) {
                    const bgParent = bgManager.backgroundActor.get_parent();
                    if (bgParent) {
                        bgParent.add_child(widget);
                    } else {
                        Main.layoutManager.uiGroup.insert_child_at_index(widget, 1);
                    }
                } else {
                    Main.layoutManager.uiGroup.insert_child_at_index(widget, 1);
                }
            }
        }
    }

    disable() {
        console.debug('GNOME Stocks: Disabling extension');
        
        if (this._settings) {
            this._settings.disconnectObject(this);
        }
        
        for (const [symbol, widget] of this._desktopWidgets) {
            const parent = widget.get_parent();
            if (parent) {
                parent.remove_child(widget);
            }
            widget.destroy();
        }
        this._desktopWidgets.clear();
        
        for (const [symbol, button] of this._stockButtons) {
            button.destroy();
        }
        this._stockButtons.clear();
        
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        
        this._settings = null;
        
        console.debug('GNOME Stocks: Extension disabled');
    }
}
