import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {StockPopupMenu, StockPanelButton, DesktopStockWidget} from './stockPopupMenu.js';

export default class GNOMEStocksExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._indicator = null;
        this._stockButtons = new Map();
        this._desktopWidgets = new Map();
        this._positionChangedId = null;
        this._panelStocksChangedId = null;
        this._showIconChangedId = null;
        this._desktopWidgetsChangedId = null;
        this._widgetMoveModeChangedId = null;
        this._indicatorAdded = false;
    }

    enable() {
        log('GNOME Stocks: Enabling extension');
        
        // Get settings
        this._settings = this.getSettings();
        
        // Create the main indicator (menu button)
        this._indicator = new StockPopupMenu(this._settings, this.path);
        
        // Add to panel
        this._addToPanel();
        
        // Then sync visibility based on settings
        this._syncIndicatorVisibility();
        
        // Create individual stock buttons
        this._createStockButtons();
        
        // Create desktop widgets
        this._createDesktopWidgets();
        
        // Listen for position changes
        this._positionChangedId = this._settings.connect('changed::panel-position', () => {
            this._repositionIndicator();
        });
        
        // Listen for panel stocks changes
        this._panelStocksChangedId = this._settings.connect('changed::panel-stocks', () => {
            this._updateStockButtons();
        });

        // Listen for indicator visibility changes
        this._showIconChangedId = this._settings.connect('changed::show-icon', () => {
            this._syncIndicatorVisibility();
        });
        
        // Listen for desktop widgets changes
        this._desktopWidgetsChangedId = this._settings.connect('changed::desktop-widgets', () => {
            this._updateDesktopWidgets();
        });
        
        // Listen for widget move mode changes
        this._widgetMoveModeChangedId = this._settings.connect('changed::widget-move-mode', () => {
            this._updateWidgetMoveMode();
        });
        
        log('GNOME Stocks: Extension enabled');
    }

    _addToPanel() {
        if (!this._indicator || this._indicatorAdded) return;
        const position = this._settings.get_string('panel-position');
        Main.panel.addToStatusArea('gnome-stocks-indicator', this._indicator, 0, position);
        this._indicatorAdded = true;
        log('GNOME Stocks: Main indicator added to panel');
    }

    _removeFromPanel() {
        if (!this._indicator || !this._indicatorAdded) return;
        this._indicator.container.get_parent()?.remove_child(this._indicator.container);
        this._indicatorAdded = false;
        log('GNOME Stocks: Main indicator removed from panel');
    }

    _syncIndicatorVisibility() {
        const shouldShow = this._settings.get_boolean('show-icon');
        log(`GNOME Stocks: Syncing indicator visibility - shouldShow: ${shouldShow}, indicatorAdded: ${this._indicatorAdded}`);
        
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
        
        // Remove buttons for stocks no longer in panel
        for (const [symbol, button] of this._stockButtons) {
            if (!panelStocks.includes(symbol)) {
                button.destroy();
                this._stockButtons.delete(symbol);
            }
        }
        
        // Add buttons for new stocks
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
        
        // Reposition stock buttons
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
            // Access the API and logoCache from the main indicator
            const api = this._indicator?._api;
            const logoCache = this._indicator?._logoCache;
            
            const widget = new DesktopStockWidget(symbol, this._settings, api, logoCache);
            
            // Check if we're in move mode
            const moveMode = this._settings.get_boolean('widget-move-mode');
            
            if (moveMode) {
                // Add to uiGroup on top for editing
                Main.layoutManager.uiGroup.add_child(widget);
                widget.set_style(widget.get_style() + ' border: 2px solid #4caf50;');
            } else {
                // Add to background group so it appears on desktop behind windows
                // The background group contains the desktop wallpaper
                const bgManager = Main.layoutManager._bgManagers?.[0];
                if (bgManager && bgManager.backgroundActor) {
                    // Add after the background actor in the same parent
                    const bgParent = bgManager.backgroundActor.get_parent();
                    if (bgParent) {
                        bgParent.add_child(widget);
                    } else {
                        // Fallback: add to uiGroup at index 1 (just above background)
                        Main.layoutManager.uiGroup.insert_child_at_index(widget, 1);
                    }
                } else {
                    // Fallback: add to uiGroup at low index
                    Main.layoutManager.uiGroup.insert_child_at_index(widget, 1);
                }
            }
            
            this._desktopWidgets.set(symbol, widget);
            log(`GNOME Stocks: Created desktop widget for ${symbol}`);
        } catch (e) {
            log(`GNOME Stocks: Error creating desktop widget for ${symbol}: ${e.message}`);
        }
    }
    
    _updateDesktopWidgets() {
        const desktopWidgets = this._settings.get_strv('desktop-widgets');
        
        // Remove widgets for stocks no longer pinned
        for (const [symbol, widget] of this._desktopWidgets) {
            if (!desktopWidgets.includes(symbol)) {
                const parent = widget.get_parent();
                if (parent) {
                    parent.remove_child(widget);
                }
                widget.destroy();
                this._desktopWidgets.delete(symbol);
                log(`GNOME Stocks: Removed desktop widget for ${symbol}`);
            }
        }
        
        // Add widgets for newly pinned stocks
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
                // Move widget to uiGroup on top for editing
                if (currentParent) {
                    currentParent.remove_child(widget);
                }
                Main.layoutManager.uiGroup.add_child(widget);
                Main.layoutManager.uiGroup.set_child_above_sibling(widget, null);
                widget.set_style(widget.get_style() + ' border: 2px solid #4caf50;');
                widget.ease({
                    opacity: 255,
                    duration: 200,
                    mode: imports.gi.Clutter.AnimationMode.EASE_OUT_QUAD
                });
            } else {
                // Move widget back to background layer
                if (currentParent) {
                    currentParent.remove_child(widget);
                }
                // Remove the border indicator
                const currentStyle = widget.get_style() || '';
                widget.set_style(currentStyle.replace(' border: 2px solid #4caf50;', ''));
                
                // Add to background group
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
        log('GNOME Stocks: Disabling extension');
        
        if (this._positionChangedId) {
            this._settings.disconnect(this._positionChangedId);
            this._positionChangedId = null;
        }
        
        if (this._panelStocksChangedId) {
            this._settings.disconnect(this._panelStocksChangedId);
            this._panelStocksChangedId = null;
        }

        if (this._showIconChangedId) {
            this._settings.disconnect(this._showIconChangedId);
            this._showIconChangedId = null;
        }
        
        if (this._desktopWidgetsChangedId) {
            this._settings.disconnect(this._desktopWidgetsChangedId);
            this._desktopWidgetsChangedId = null;
        }
        
        // Destroy all desktop widgets
        for (const [symbol, widget] of this._desktopWidgets) {
            const parent = widget.get_parent();
            if (parent) {
                parent.remove_child(widget);
            }
            widget.destroy();
        }
        this._desktopWidgets.clear();
        
        // Destroy all stock buttons
        for (const [symbol, button] of this._stockButtons) {
            button.destroy();
        }
        this._stockButtons.clear();
        
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        
        this._settings = null;
        
        log('GNOME Stocks: Extension disabled');
    }
}
