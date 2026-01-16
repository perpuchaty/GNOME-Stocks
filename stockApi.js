import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';

const API_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const SEARCH_URL = 'https://query1.finance.yahoo.com/v1/finance/search';
// Multiple logo sources for better coverage
const LOGO_SOURCES = [
    'https://www.google.com/s2/favicons?sz=128&domain=',
    'https://logo.clearbit.com/',
    'https://icons.duckduckgo.com/ip3/',  // DuckDuckGo icons (append .ico)
];

export class StockAPI {
    constructor() {
        this._session = new Soup.Session();
        this._session.timeout = 10;
    }

    async searchStocks(query) {
        return new Promise((resolve, reject) => {
            const url = `${SEARCH_URL}?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`;
            const message = Soup.Message.new('GET', url);
            
            // Add headers to mimic browser request
            message.request_headers.append('User-Agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36');
            message.request_headers.append('Accept', 'application/json');
            
            this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (session, result) => {
                try {
                    const bytes = session.send_and_read_finish(result);
                    if (!bytes || bytes.get_size() === 0) {
                        resolve([]);
                        return;
                    }
                    
                    const decoder = new TextDecoder('utf-8');
                    const text = decoder.decode(bytes.get_data());
                    
                    // Check if response looks like JSON
                    if (!text || !text.trim().startsWith('{')) {
                        console.log('GNOME Stocks: Non-JSON response from search API');
                        resolve([]);
                        return;
                    }
                    
                    const data = JSON.parse(text);
                    
                    if (data.quotes) {
                        const stocks = data.quotes
                            .filter(q => {
                                // Include stocks, ETFs, and indices
                                if (q.quoteType === 'EQUITY' || q.quoteType === 'ETF' || q.quoteType === 'INDEX') {
                                    return true;
                                }
                                // For crypto, only include USD pairs
                                if (q.quoteType === 'CRYPTOCURRENCY') {
                                    return q.symbol.endsWith('-USD');
                                }
                                return false;
                            })
                            .map(q => {
                                const isCrypto = q.quoteType === 'CRYPTOCURRENCY';
                                // For crypto, show clean name without -USD
                                let displaySymbol = q.symbol;
                                let displayName = q.shortname || q.longname || q.symbol;
                                
                                if (isCrypto && q.symbol.endsWith('-USD')) {
                                    displaySymbol = q.symbol.replace('-USD', '');
                                    // Clean up the name too
                                    displayName = displayName.replace(' USD', '').replace(' / USD', '').replace('/USD', '');
                                }
                                
                                return {
                                    symbol: q.symbol,  // Keep original for API calls
                                    displaySymbol: displaySymbol,  // Clean display name
                                    name: displayName,
                                    exchange: q.exchange,
                                    type: q.quoteType,
                                    isCrypto: isCrypto
                                };
                            });
                        resolve(stocks);
                    } else {
                        resolve([]);
                    }
                } catch (e) {
                    console.log(`GNOME Stocks: Search error: ${e.message}`);
                    resolve([]); // Return empty instead of rejecting
                }
            });
        });
    }

    async getStockQuote(symbol) {
        return new Promise((resolve, reject) => {
            const url = `${API_BASE_URL}${encodeURIComponent(symbol)}?interval=1d&range=1d`;
            const message = Soup.Message.new('GET', url);
            
            // Add headers to mimic browser request
            message.request_headers.append('User-Agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36');
            message.request_headers.append('Accept', 'application/json');
            
            this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (session, result) => {
                try {
                    const bytes = session.send_and_read_finish(result);
                    if (!bytes || bytes.get_size() === 0) {
                        reject(new Error('Empty response'));
                        return;
                    }
                    
                    const decoder = new TextDecoder('utf-8');
                    const text = decoder.decode(bytes.get_data());
                    
                    // Check if response looks like JSON
                    if (!text || !text.trim().startsWith('{')) {
                        reject(new Error('Invalid response format'));
                        return;
                    }
                    
                    const data = JSON.parse(text);
                    
                    if (data.chart && data.chart.result && data.chart.result[0]) {
                        const chartData = data.chart.result[0];
                        const meta = chartData.meta;
                        const quote = chartData.indicators?.quote?.[0];
                        
                        const currentPrice = meta.regularMarketPrice;
                        const previousClose = meta.chartPreviousClose || meta.previousClose;
                        const change = currentPrice - previousClose;
                        const changePercent = (change / previousClose) * 100;
                        
                        // Detect if this is a cryptocurrency
                        const isCrypto = meta.instrumentType === 'CRYPTOCURRENCY' || 
                                        symbol.endsWith('-USD') || 
                                        meta.exchangeName === 'CCC';
                        
                        // Clean display symbol for crypto (remove -USD suffix)
                        let displaySymbol = meta.symbol;
                        let displayName = meta.shortName || meta.longName || meta.symbol;
                        if (isCrypto && meta.symbol.endsWith('-USD')) {
                            displaySymbol = meta.symbol.replace('-USD', '');
                            displayName = displayName.replace(' USD', '').replace(' / USD', '').replace('/USD', '');
                        }
                        
                        resolve({
                            symbol: meta.symbol,
                            displaySymbol: displaySymbol,
                            name: displayName,
                            price: currentPrice,
                            previousClose: previousClose,
                            change: change,
                            changePercent: changePercent,
                            currency: meta.currency,
                            exchange: meta.exchangeName,
                            marketState: meta.marketState,
                            isCrypto: isCrypto,
                            timestamp: Date.now()
                        });
                    } else {
                        reject(new Error('No data available'));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
    }

    async getMultipleQuotes(symbols) {
        const promises = symbols.map(symbol => 
            this.getStockQuote(symbol).catch(e => ({
                symbol: symbol,
                error: e.message
            }))
        );
        return Promise.all(promises);
    }

    getLogoUrl(symbol, companyName) {
        // Direct crypto icon URLs using CryptoLogos/CoinGecko CDN
        const cryptoIconUrls = {
            'BTC-USD': 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
            'BTC': 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
            'ETH-USD': 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
            'ETH': 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
            'BNB-USD': 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png',
            'BNB': 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png',
            'XRP-USD': 'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png',
            'XRP': 'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png',
            'ADA-USD': 'https://assets.coingecko.com/coins/images/975/large/cardano.png',
            'ADA': 'https://assets.coingecko.com/coins/images/975/large/cardano.png',
            'DOGE-USD': 'https://assets.coingecko.com/coins/images/5/large/dogecoin.png',
            'DOGE': 'https://assets.coingecko.com/coins/images/5/large/dogecoin.png',
            'SOL-USD': 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
            'SOL': 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
            'DOT-USD': 'https://assets.coingecko.com/coins/images/12171/large/polkadot.png',
            'DOT': 'https://assets.coingecko.com/coins/images/12171/large/polkadot.png',
            'MATIC-USD': 'https://assets.coingecko.com/coins/images/4713/large/matic-token-icon.png',
            'MATIC': 'https://assets.coingecko.com/coins/images/4713/large/matic-token-icon.png',
            'LTC-USD': 'https://assets.coingecko.com/coins/images/2/large/litecoin.png',
            'LTC': 'https://assets.coingecko.com/coins/images/2/large/litecoin.png',
            'SHIB-USD': 'https://assets.coingecko.com/coins/images/11939/large/shiba.png',
            'SHIB': 'https://assets.coingecko.com/coins/images/11939/large/shiba.png',
            'TRX-USD': 'https://assets.coingecko.com/coins/images/1094/large/tron-logo.png',
            'TRX': 'https://assets.coingecko.com/coins/images/1094/large/tron-logo.png',
            'AVAX-USD': 'https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png',
            'AVAX': 'https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png',
            'LINK-USD': 'https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png',
            'LINK': 'https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png',
            'ATOM-USD': 'https://assets.coingecko.com/coins/images/1481/large/cosmos_hub.png',
            'ATOM': 'https://assets.coingecko.com/coins/images/1481/large/cosmos_hub.png',
            'UNI-USD': 'https://assets.coingecko.com/coins/images/12504/large/uniswap-uni.png',
            'UNI': 'https://assets.coingecko.com/coins/images/12504/large/uniswap-uni.png',
            'XLM-USD': 'https://assets.coingecko.com/coins/images/100/large/Stellar_symbol_black_RGB.png',
            'XLM': 'https://assets.coingecko.com/coins/images/100/large/Stellar_symbol_black_RGB.png',
            'ALGO-USD': 'https://assets.coingecko.com/coins/images/4380/large/download.png',
            'ALGO': 'https://assets.coingecko.com/coins/images/4380/large/download.png',
            'VET-USD': 'https://assets.coingecko.com/coins/images/1167/large/VeChain-Logo-768x725.png',
            'VET': 'https://assets.coingecko.com/coins/images/1167/large/VeChain-Logo-768x725.png',
            'FIL-USD': 'https://assets.coingecko.com/coins/images/12817/large/filecoin.png',
            'FIL': 'https://assets.coingecko.com/coins/images/12817/large/filecoin.png',
            'ICP-USD': 'https://assets.coingecko.com/coins/images/14495/large/Internet_Computer_logo.png',
            'ICP': 'https://assets.coingecko.com/coins/images/14495/large/Internet_Computer_logo.png',
            'AAVE-USD': 'https://assets.coingecko.com/coins/images/12645/large/AAVE.png',
            'AAVE': 'https://assets.coingecko.com/coins/images/12645/large/AAVE.png',
            'EOS-USD': 'https://assets.coingecko.com/coins/images/738/large/eos-eos-logo.png',
            'EOS': 'https://assets.coingecko.com/coins/images/738/large/eos-eos-logo.png',
            'XTZ-USD': 'https://assets.coingecko.com/coins/images/976/large/Tezos-logo.png',
            'XTZ': 'https://assets.coingecko.com/coins/images/976/large/Tezos-logo.png',
            'XMR-USD': 'https://assets.coingecko.com/coins/images/69/large/monero_logo.png',
            'XMR': 'https://assets.coingecko.com/coins/images/69/large/monero_logo.png',
            'PEPE-USD': 'https://assets.coingecko.com/coins/images/29850/large/pepe-token.jpeg',
            'PEPE': 'https://assets.coingecko.com/coins/images/29850/large/pepe-token.jpeg',
            'ARB-USD': 'https://assets.coingecko.com/coins/images/16547/large/photo_2023-03-29_21.47.00.jpeg',
            'ARB': 'https://assets.coingecko.com/coins/images/16547/large/photo_2023-03-29_21.47.00.jpeg',
            'OP-USD': 'https://assets.coingecko.com/coins/images/25244/large/Optimism.png',
            'OP': 'https://assets.coingecko.com/coins/images/25244/large/Optimism.png',
            'APT-USD': 'https://assets.coingecko.com/coins/images/26455/large/aptos_round.png',
            'APT': 'https://assets.coingecko.com/coins/images/26455/large/aptos_round.png',
            'NEAR-USD': 'https://assets.coingecko.com/coins/images/10365/large/near.jpg',
            'NEAR': 'https://assets.coingecko.com/coins/images/10365/large/near.jpg',
            'SUI-USD': 'https://assets.coingecko.com/coins/images/26375/large/sui_asset.jpeg',
            'SUI': 'https://assets.coingecko.com/coins/images/26375/large/sui_asset.jpeg',
        };
        
        // Check for direct crypto URL first
        if (cryptoIconUrls[symbol]) {
            return {
                domain: symbol,
                sources: [cryptoIconUrls[symbol]],
                isDirect: true
            };
        }
        
        // Try to derive domain from company name
        // Common mappings for popular stocks
        const domainMappings = {
            'AAPL': 'apple.com',
            'GOOGL': 'google.com',
            'GOOG': 'google.com',
            'MSFT': 'microsoft.com',
            'AMZN': 'amazon.com',
            'META': 'meta.com',
            'TSLA': 'tesla.com',
            'NVDA': 'nvidia.com',
            'AMD': 'amd.com',
            'INTC': 'intel.com',
            'NFLX': 'netflix.com',
            'DIS': 'disney.com',
            'PYPL': 'paypal.com',
            'ADBE': 'adobe.com',
            'CRM': 'salesforce.com',
            'ORCL': 'oracle.com',
            'IBM': 'ibm.com',
            'CSCO': 'cisco.com',
            'QCOM': 'qualcomm.com',
            'TXN': 'ti.com',
            'AVGO': 'broadcom.com',
            'SHOP': 'shopify.com',
            'SQ': 'squareup.com',
            'UBER': 'uber.com',
            'LYFT': 'lyft.com',
            'SNAP': 'snap.com',
            'TWTR': 'twitter.com',
            'PINS': 'pinterest.com',
            'ZM': 'zoom.us',
            'DOCU': 'docusign.com',
            'SPOT': 'spotify.com',
            'ROKU': 'roku.com',
            'V': 'visa.com',
            'MA': 'mastercard.com',
            'JPM': 'jpmorganchase.com',
            'BAC': 'bankofamerica.com',
            'WFC': 'wellsfargo.com',
            'GS': 'goldmansachs.com',
            'MS': 'morganstanley.com',
            'C': 'citigroup.com',
            'AXP': 'americanexpress.com',
            'BLK': 'blackrock.com',
            'SCHW': 'schwab.com',
            'WMT': 'walmart.com',
            'TGT': 'target.com',
            'COST': 'costco.com',
            'HD': 'homedepot.com',
            'LOW': 'lowes.com',
            'NKE': 'nike.com',
            'SBUX': 'starbucks.com',
            'MCD': 'mcdonalds.com',
            'KO': 'coca-cola.com',
            'PEP': 'pepsi.com',
            'PG': 'pg.com',
            'JNJ': 'jnj.com',
            'PFE': 'pfizer.com',
            'MRNA': 'modernatx.com',
            'UNH': 'unitedhealthgroup.com',
            'CVS': 'cvs.com',
            'WBA': 'walgreens.com',
            'ABBV': 'abbvie.com',
            'LLY': 'lilly.com',
            'TMO': 'thermofisher.com',
            'DHR': 'danaher.com',
            'ABT': 'abbott.com',
            'BMY': 'bms.com',
            'AMGN': 'amgen.com',
            'GILD': 'gilead.com',
            'BIIB': 'biogen.com',
            'REGN': 'regeneron.com',
            'VRTX': 'vrtx.com',
            'ZTS': 'zoetis.com',
            'BA': 'boeing.com',
            'LMT': 'lockheedmartin.com',
            'RTX': 'rtx.com',
            'NOC': 'northropgrumman.com',
            'GD': 'gd.com',
            'CAT': 'caterpillar.com',
            'DE': 'deere.com',
            'MMM': '3m.com',
            'HON': 'honeywell.com',
            'GE': 'ge.com',
            'UPS': 'ups.com',
            'FDX': 'fedex.com',
            'F': 'ford.com',
            'GM': 'gm.com',
            'TM': 'toyota.com',
            'HMC': 'honda.com',
            'XOM': 'exxonmobil.com',
            'CVX': 'chevron.com',
            'COP': 'conocophillips.com',
            'OXY': 'oxy.com',
            'SLB': 'slb.com',
            'T': 'att.com',
            'VZ': 'verizon.com',
            'TMUS': 't-mobile.com',
            'CMCSA': 'comcast.com',
            'CHTR': 'charter.com',
            'NEE': 'nexteraenergy.com',
            'DUK': 'duke-energy.com',
            'SO': 'southerncompany.com',
            'D': 'dominionenergy.com',
            'AEP': 'aep.com',
            'SPY': 'ssga.com',
            'QQQ': 'invesco.com',
            'IWM': 'ishares.com',
            'DIA': 'ssga.com',
            'VOO': 'vanguard.com',
            'VTI': 'vanguard.com',
            'BRK.A': 'berkshirehathaway.com',
            'BRK.B': 'berkshirehathaway.com',
            'PLTR': 'palantir.com',
            'SNOW': 'snowflake.com',
            'DDOG': 'datadoghq.com',
            'NET': 'cloudflare.com',
            'CRWD': 'crowdstrike.com',
            'ZS': 'zscaler.com',
            'OKTA': 'okta.com',
            'TWLO': 'twilio.com',
            'MDB': 'mongodb.com',
            'ESTC': 'elastic.co',
            'SPLK': 'splunk.com',
            'NOW': 'servicenow.com',
            'WDAY': 'workday.com',
            'TEAM': 'atlassian.com',
            'VEEV': 'veeva.com',
            'PANW': 'paloaltonetworks.com',
            'FTNT': 'fortinet.com',
            'COIN': 'coinbase.com',
            'HOOD': 'robinhood.com',
            'ABNB': 'airbnb.com',
            'DASH': 'doordash.com',
            'RBLX': 'roblox.com',
            'U': 'unity.com',
            'EA': 'ea.com',
            'ATVI': 'activision.com',
            'TTWO': 'take2games.com',
            'SE': 'sea.com',
            'BABA': 'alibaba.com',
            'JD': 'jd.com',
            'PDD': 'pinduoduo.com',
            'BIDU': 'baidu.com',
            'NIO': 'nio.com',
            'XPEV': 'xiaopeng.com',
            'LI': 'lixiang.com',
            'TSM': 'tsmc.com',
            'ASML': 'asml.com',
            'SAP': 'sap.com',
            'TM': 'toyota.com',
            'SONY': 'sony.com',
            'SNE': 'sony.com',
            'NVS': 'novartis.com',
            'AZN': 'astrazeneca.com',
            'GSK': 'gsk.com',
            'SNY': 'sanofi.com',
            'NVO': 'novonordisk.com',
            'SHEL': 'shell.com',
            'BP': 'bp.com',
            'TTE': 'totalenergies.com',
            'RIVN': 'rivian.com',
            'LCID': 'lucidmotors.com',
            // Bitcoin/Crypto ETFs
            'IBIT': 'blackrock.com',
            'GBTC': 'grayscale.com',
            'BITO': 'proshares.com',
            'OBTC': 'ospreyfunds.io',
            'FBTC': 'fidelity.com',
            'ARKB': 'ark-funds.com',
            'BITB': 'bitwiseinvestments.com',
            'HODL': 'vaneck.com',
            'BTCW': 'wisdomtree.com',
            'EZBC': 'franklintempleton.com',
            'BTCO': 'invesco.com',
            'DEFI': 'hashdex.com',
            // More healthcare
            'CVS': 'cvs.com',
            'CI': 'cigna.com',
            'HUM': 'humana.com',
            'ANTM': 'anthem.com',
            'ELV': 'elevancehealth.com',
            'HCA': 'hcahealthcare.com',
            'CNC': 'centene.com',
            'MOH': 'molinahealthcare.com'
        };
        
        // Check if it's a known crypto - return direct icon URL
        if (cryptoIconUrls[symbol]) {
            return { isDirect: true, domain: symbol, sources: [cryptoIconUrls[symbol]] };
        }
        
        if (domainMappings[symbol]) {
            return { domain: domainMappings[symbol], sources: LOGO_SOURCES };
        }
        
        // Try to guess domain from company name
        if (companyName) {
            const cleanName = companyName
                .toLowerCase()
                .replace(/,?\s*(inc\.?|corp\.?|corporation|company|co\.?|ltd\.?|llc|plc|holdings?|group|enterprises?|incorporated|limited)$/gi, '')
                .trim()
                .replace(/[^a-z0-9]/g, '');
            if (cleanName.length > 2) {
                return { domain: `${cleanName}.com`, sources: LOGO_SOURCES };
            }
        }
        
        return null;
    }

    async getChartData(symbol, range = '1mo', interval = '1d') {
        return new Promise((resolve, reject) => {
            const url = `${API_BASE_URL}${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
            const message = Soup.Message.new('GET', url);
            
            message.request_headers.append('User-Agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36');
            message.request_headers.append('Accept', 'application/json');
            
            this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (session, result) => {
                try {
                    const bytes = session.send_and_read_finish(result);
                    if (!bytes || bytes.get_size() === 0) {
                        reject(new Error('Empty response'));
                        return;
                    }
                    
                    const decoder = new TextDecoder('utf-8');
                    const text = decoder.decode(bytes.get_data());
                    
                    if (!text || !text.trim().startsWith('{')) {
                        reject(new Error('Invalid response format'));
                        return;
                    }
                    
                    const data = JSON.parse(text);
                    
                    if (data.chart && data.chart.result && data.chart.result[0]) {
                        const chartData = data.chart.result[0];
                        const timestamps = chartData.timestamp || [];
                        const quotes = chartData.indicators?.quote?.[0] || {};
                        const meta = chartData.meta;
                        
                        const prices = [];
                        for (let i = 0; i < timestamps.length; i++) {
                            if (quotes.close && quotes.close[i] !== null) {
                                prices.push({
                                    timestamp: timestamps[i] * 1000,
                                    open: quotes.open?.[i],
                                    high: quotes.high?.[i],
                                    low: quotes.low?.[i],
                                    close: quotes.close[i],
                                    volume: quotes.volume?.[i]
                                });
                            }
                        }
                        
                        resolve({
                            symbol: meta.symbol,
                            currency: meta.currency,
                            prices: prices,
                            range: range,
                            interval: interval
                        });
                    } else {
                        reject(new Error('No chart data available'));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
    }

    destroy() {
        this._session = null;
    }
}
