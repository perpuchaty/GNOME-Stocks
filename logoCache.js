import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';

const CACHE_DIR = GLib.get_user_cache_dir() + '/gnome-stocks-logos';

export class LogoCache {
    constructor() {
        this._cache = new Map();
        this._session = new Soup.Session();
        this._session.timeout = 10;
        this._pendingLoads = new Map();
        
        const dir = Gio.File.new_for_path(CACHE_DIR);
        if (!dir.query_exists(null)) {
            try {
                dir.make_directory_with_parents(null);
            } catch (e) {
                console.debug(`GNOME Stocks: Could not create cache dir: ${e.message}`);
            }
        }
    }

    getCachePath(symbol) {
        return `${CACHE_DIR}/${symbol.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
    }

    async loadLogo(symbol, logoInfo, callback) {
        if (!logoInfo) {
            callback(null);
            return;
        }
        
        let domain, sources;
        if (typeof logoInfo === 'string') {
            domain = logoInfo;
            sources = [logoInfo];
        } else if (logoInfo.isDirect) {
            domain = logoInfo.domain;
            sources = logoInfo.sources;
        } else {
            domain = logoInfo.domain;
            sources = logoInfo.sources || [];
        }

        if (this._cache.has(symbol)) {
            callback(this._cache.get(symbol));
            return;
        }

        if (this._pendingLoads.has(symbol)) {
            this._pendingLoads.get(symbol).push(callback);
            return;
        }

        this._pendingLoads.set(symbol, [callback]);

        const cachePath = this.getCachePath(symbol);
        const cacheFile = Gio.File.new_for_path(cachePath);
        
        if (cacheFile.query_exists(null)) {
            try {
                const gicon = Gio.FileIcon.new(cacheFile);
                this._cache.set(symbol, gicon);
                this._notifyCallbacks(symbol, gicon);
                return;
            } catch (e) {
                // A bad cache entry is harmless; the download below replaces it.
            }
        }

        let urlsToTry;
        if (logoInfo.isDirect) {
            urlsToTry = sources;
        } else {
            urlsToTry = sources.map(source => {
                if (source.includes('duckduckgo')) {
                    return `${source}${domain}.ico`;
                }
                return `${source}${domain}`;
            });
        }

        this._tryLoadFromUrls(symbol, urlsToTry, 0, cacheFile);
    }
    
    _tryLoadFromUrls(symbol, urls, index, cacheFile) {
        if (index >= urls.length) {
            this._notifyCallbacks(symbol, null);
            return;
        }
        
        const url = urls[index];
        const message = Soup.Message.new('GET', url);
        message.request_headers.append('User-Agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36');
        message.request_headers.append('Accept', 'image/*');
        
        this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (session, result) => {
            try {
                const statusCode = message.get_status();
                const bytes = session.send_and_read_finish(result);
                
                if (statusCode === Soup.Status.OK || statusCode === 200) {
                    if (bytes && bytes.get_size() > 100) {
                        const data = bytes.get_data();
                        
                        // Tiny responses are usually an error page or a generic favicon.
                        if (data && data.length > 500) {
                            try {
                                const outputStream = cacheFile.replace(null, false, Gio.FileCreateFlags.NONE, null);
                                outputStream.write_bytes(bytes, null);
                                outputStream.close(null);
                                
                                const gicon = Gio.FileIcon.new(cacheFile);
                                this._cache.set(symbol, gicon);
                                this._notifyCallbacks(symbol, gicon);
                                return;
                            } catch (writeError) {
                                console.debug(`GNOME Stocks: Error writing cache: ${writeError.message}`);
                            }
                        }
                    }
                }
                
                this._tryLoadFromUrls(symbol, urls, index + 1, cacheFile);
            } catch (e) {
                this._tryLoadFromUrls(symbol, urls, index + 1, cacheFile);
            }
        });
    }

    _notifyCallbacks(symbol, gicon) {
        const callbacks = this._pendingLoads.get(symbol) || [];
        this._pendingLoads.delete(symbol);
        callbacks.forEach(cb => {
            try {
                cb(gicon);
            } catch (e) {
               console.debug(`GNOME Stocks: Error in logo callback: ${e.message}`);
            }
        });
    }

    clearCache() {
        this._cache.clear();
        
        const dir = Gio.File.new_for_path(CACHE_DIR);
        if (dir.query_exists(null)) {
            const enumerator = dir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
            let info;
            while ((info = enumerator.next_file(null)) !== null) {
                const child = dir.get_child(info.get_name());
                child.delete(null);
            }
        }
    }

    destroy() {
        this._cache.clear();
        this._pendingLoads.clear();
        if (this._session) {
            this._session.abort();
            this._session = null;
        }
    }
}
