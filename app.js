// --- Constants & Config ---
const PROXY_URL = "https://api.allorigins.win/raw?url=";
const CNN_FG_URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";
const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/";
const YAHOO_SEARCH_URL = "https://query1.finance.yahoo.com/v1/finance/search";

// Ticker Tape Assets
const TAPE_TICKERS = ["SPY", "QQQ", "DIA", "BTC-USD", "ETH-USD", "GC=F", "CL=F"];

// State
let appState = {
    symbol: "SPY",
    range: "1mo",
    interval: "1d",
    chartData: null,
    indicators: [],
    pinned: []
};

let searchDebounceTimer = null;

// DOM Elements
const els = {
    tape: document.getElementById('ticker-tape'),
    assetSelect: document.getElementById('asset-type-select'),
    symbolInput: document.getElementById('symbol-input'),
    searchResults: document.getElementById('search-results'),
    searchBtn: document.getElementById('search-btn'),

    // Chart
    chartSymbol: document.getElementById('chart-symbol'),
    pinBtn: document.getElementById('pin-btn'),
    timeDisplay: document.getElementById('chart-time-display'),
    timeButtons: document.querySelectorAll('.range-btn'),
    indicatorChecks: document.querySelectorAll('#indicator-controls input'),

    // Watchlist
    watchlistContainer: document.getElementById('watchlist-container'),

    // Quote
    quotePrice: document.getElementById('quote-price'),
    quoteChange: document.getElementById('quote-change'),

    // Stats
    statOpen: document.getElementById('stat-open'),
    statHigh: document.getElementById('stat-high'),
    statLow: document.getElementById('stat-low'),
    statVol: document.getElementById('stat-vol'),

    // Fear & Greed
    fgGauge: document.getElementById('fg-gauge'),
    fgText: document.getElementById('fg-text'),
    fgPrev: document.getElementById('fg-prev'),
    fgWeek: document.getElementById('fg-week')
};

// --- Initialization ---
async function init() {
    loadWatchlist();
    initTickerTape();
    loadFearAndGreed();

    // Initial Load
    await loadMainChart();

    // Event Listeners
    els.searchBtn.addEventListener('click', handleSearch);
    els.symbolInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });
    els.symbolInput.addEventListener('input', handleSearchInput);

    // Hide dropdown on outside click
    document.addEventListener('click', (e) => {
        if (!els.symbolInput.contains(e.target) && !els.searchResults.contains(e.target)) {
            els.searchResults.classList.remove('active');
        }
    });

    // Pin Button
    els.pinBtn.addEventListener('click', togglePin);

    // Asset Select Shortcut
    els.assetSelect.addEventListener('change', () => {
        els.symbolInput.focus();
    });

    // Time Range
    els.timeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            els.timeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            appState.range = btn.dataset.range;
            appState.interval = btn.dataset.interval;
            loadMainChart();
        });
    });

    // Indicators
    els.indicatorChecks.forEach(cb => {
        cb.addEventListener('change', updateIndicators);
    });
}

// --- Data Fetching ---

async function fetchJson(url) {
    const finalUrl = PROXY_URL + encodeURIComponent(url);
    const resp = await fetch(finalUrl);
    if (!resp.ok) throw new Error(`Fetch error: ${resp.status}`);
    return await resp.json();
}

async function initTickerTape() {
    els.tape.innerHTML = "";

    // Batch fetch using Quote API v7 to avoid rate limits
    const symbols = TAPE_TICKERS.join(',');
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`;

    try {
        const data = await fetchJson(url);
        const results = data.quoteResponse.result || [];

        // Duplicate list to make scrolling look continuous if list is short
        const displayList = [...results, ...results];

        displayList.forEach(item => {
            const price = item.regularMarketPrice;
            const prev = item.regularMarketPreviousClose || price;

            let change = 0;
            let pct = 0;
            if (prev && prev > 0) {
                change = price - prev;
                pct = (change / prev) * 100;
            }

            const colorClass = change >= 0 ? "up" : "down";
            const sign = change >= 0 ? "+" : "";

            const div = document.createElement('div');
            div.className = 'ticker-item';

            // Use textContent where possible for safety
            const symSpan = document.createElement('span');
            symSpan.textContent = item.symbol + " ";

            const valSpan = document.createElement('span');
            valSpan.className = colorClass;
            valSpan.textContent = `${price.toFixed(2)} (${sign}${pct.toFixed(2)}%)`;

            div.appendChild(symSpan);
            div.appendChild(valSpan);
            els.tape.appendChild(div);
        });

    } catch (e) {
        console.error("Ticker Tape Error:", e);
        els.tape.innerHTML = '<div class="ticker-item" style="color:#666">Market Data Unavailable</div>';
    }
}

async function loadFearAndGreed() {
    try {
        const data = await fetchJson(CNN_FG_URL);
        const fg = data.fear_and_greed;

        updateGauge(fg.score, fg.rating);

        els.fgText.innerHTML = `${fg.score.toFixed(0)} <span style="color:#888; font-size:0.8em">/ 100</span><br><span style="font-size:0.8em; color:${getRatingColor(fg.score)}">${fg.rating.toUpperCase()}</span>`;

        els.fgPrev.textContent = fg.previous_close.toFixed(0);
        els.fgWeek.textContent = fg.previous_1_week.toFixed(0);

    } catch (e) {
        console.error("FG Error", e);
        els.fgText.textContent = "Data Unavailable";
    }
}

// --- Search & Watchlist ---

function handleSearchInput(e) {
    const val = e.target.value.trim();

    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);

    if (val.length < 1) {
        els.searchResults.classList.remove('active');
        return;
    }

    searchDebounceTimer = setTimeout(() => {
        fetchSearchResults(val);
    }, 300);
}

async function fetchSearchResults(query) {
    const url = `${YAHOO_SEARCH_URL}?q=${query}&quotesCount=5&newsCount=0`;
    try {
        const data = await fetchJson(url);
        const quotes = data.quotes || [];
        renderSearchResults(quotes);
    } catch (e) {
        console.error("Search failed", e);
    }
}

function renderSearchResults(quotes) {
    els.searchResults.innerHTML = "";

    if (quotes.length === 0) {
        els.searchResults.classList.remove('active');
        return;
    }

    quotes.forEach(q => {
        // Filter out irrelevant types if needed, generally Yahoo search is good
        if (!q.symbol) return;

        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.innerHTML = `
            <span class="result-symbol">${q.symbol}</span>
            <span class="result-name">${q.longname || q.shortname || ''}</span>
        `;
        item.addEventListener('click', () => {
            selectSymbol(q.symbol);
        });
        els.searchResults.appendChild(item);
    });

    els.searchResults.classList.add('active');
}

function selectSymbol(sym) {
    appState.symbol = sym;
    els.symbolInput.value = sym;
    els.searchResults.classList.remove('active');
    loadMainChart();
}

async function handleSearch() {
    const val = els.symbolInput.value.trim().toUpperCase();
    if (val) {
        selectSymbol(val);
    }
}

function togglePin() {
    const sym = appState.symbol;
    const idx = appState.pinned.indexOf(sym);

    if (idx === -1) {
        appState.pinned.push(sym);
    } else {
        appState.pinned.splice(idx, 1);
    }

    saveWatchlist();
    renderWatchlist();
    updatePinButton();
}

function updatePinButton() {
    const isPinned = appState.pinned.includes(appState.symbol);
    if (isPinned) {
        els.pinBtn.classList.add('active');
        els.pinBtn.innerHTML = '<i class="fa-solid fa-star"></i>';
    } else {
        els.pinBtn.classList.remove('active');
        els.pinBtn.innerHTML = '<i class="fa-regular fa-star"></i>';
    }
}

function loadWatchlist() {
    const saved = localStorage.getItem('prime_market_watchlist');
    if (saved) {
        try {
            appState.pinned = JSON.parse(saved);
        } catch(e) { appState.pinned = []; }
    }
    renderWatchlist();
}

function saveWatchlist() {
    localStorage.setItem('prime_market_watchlist', JSON.stringify(appState.pinned));
}

function renderWatchlist() {
    els.watchlistContainer.innerHTML = "";

    if (appState.pinned.length === 0) {
        els.watchlistContainer.innerHTML = '<div class="empty-watchlist">No pinned items</div>';
        return;
    }

    appState.pinned.forEach(sym => {
        const el = document.createElement('div');
        el.className = 'watchlist-item';
        el.innerHTML = `
            <span>${sym}</span>
            <span class="watchlist-remove">&times;</span>
        `;

        // Click on item -> Load
        el.addEventListener('click', (e) => {
            if (e.target.classList.contains('watchlist-remove')) return;
            selectSymbol(sym);
        });

        // Click on X -> Remove
        el.querySelector('.watchlist-remove').addEventListener('click', (e) => {
            e.stopPropagation();
            appState.pinned = appState.pinned.filter(s => s !== sym);
            saveWatchlist();
            renderWatchlist();
            updatePinButton();
        });

        els.watchlistContainer.appendChild(el);
    });
}

// --- Chart Logic ---

async function loadMainChart() {
    els.chartSymbol.innerHTML = `<span style="color:var(--text-muted)">LOADING...</span>`;
    updatePinButton(); // Update immediately for current symbol context

    const { symbol, range, interval } = appState;
    const url = `${YAHOO_CHART_URL}${symbol}?range=${range}&interval=${interval}`;

    try {
        const data = await fetchJson(url);

        if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
            throw new Error("No data");
        }

        const res = data.chart.result[0];
        const quote = res.indicators.quote[0];
        const timestamps = res.timestamp;

        if (!timestamps || timestamps.length === 0) {
             throw new Error("Empty timestamps");
        }

        // Process Data
        const cleanData = timestamps.map((t, i) => ({
            time: new Date(t * 1000),
            open: quote.open[i],
            high: quote.high[i],
            low: quote.low[i],
            close: quote.close[i],
            volume: quote.volume[i]
        })).filter(d => d.close !== null);

        appState.chartData = cleanData;

        // Update UI Header
        els.chartSymbol.textContent = symbol;
        const last = cleanData[cleanData.length-1];
        if (last) {
            els.timeDisplay.textContent = last.time.toLocaleString();

            // Update Quote Card
            updateQuoteCard(cleanData);
            updateStatsCard(cleanData);

            // Calc Indicators & Render
            try {
                updateIndicators();
            } catch (indError) {
                console.error("Indicator Error:", indError);
                renderChart([], {});
            }
        } else {
             throw new Error("No valid price data");
        }

    } catch (e) {
        console.error(e);
        els.chartSymbol.textContent = "ERROR";
        document.getElementById('main-plot').innerHTML = `<div class="empty-state"><p>Could not load data for ${symbol}</p></div>`;
    }
}

function updateQuoteCard(data) {
    const cur = data[data.length-1];
    const prev = data[data.length-2];
    let change = 0;
    let pct = 0;

    if (prev) {
        change = cur.close - prev.close;
        pct = (change / prev.close) * 100;
    }

    els.quotePrice.textContent = cur.close.toFixed(2);
    els.quoteChange.innerHTML = `
        <i class="fa-solid fa-caret-${change >= 0 ? 'up' : 'down'}"></i>
        ${Math.abs(change).toFixed(2)} (${Math.abs(pct).toFixed(2)}%)
    `;
    els.quoteChange.className = `quote-change ${change >= 0 ? 'up' : 'down'}`;
}

function updateStatsCard(data) {
    const cur = data[data.length-1];
    els.statOpen.textContent = cur.open.toFixed(2);
    els.statHigh.textContent = cur.high.toFixed(2);
    els.statLow.textContent = cur.low.toFixed(2);

    // Format Volume (K, M, B)
    const vol = cur.volume;
    let volStr = vol;
    if (vol > 1000000000) volStr = (vol/1000000000).toFixed(2) + 'B';
    else if (vol > 1000000) volStr = (vol/1000000).toFixed(2) + 'M';
    else if (vol > 1000) volStr = (vol/1000).toFixed(2) + 'K';

    els.statVol.textContent = volStr;
}

// --- Calculation & Rendering ---

function updateIndicators() {
    if (!appState.chartData) return;

    const active = Array.from(els.indicatorChecks)
        .filter(cb => cb.checked)
        .map(cb => cb.value);

    const closes = appState.chartData.map(d => d.close);
    const indicators = {};

    // Helper to align
    const align = (res) => {
        const diff = closes.length - res.length;
        return Array(diff).fill(null).concat(res);
    };

    // Ensure we use the correct global variable (lowercase in browser)
    const TI = window.technicalindicators || window.technicalIndicators;
    if (!TI) throw new Error("Technical Indicators library not loaded");

    if (active.includes('sma20'))
        indicators.sma20 = align(TI.SMA.calculate({period: 20, values: closes}));
    if (active.includes('sma50'))
        indicators.sma50 = align(TI.SMA.calculate({period: 50, values: closes}));
    if (active.includes('ema12'))
        indicators.ema12 = align(TI.EMA.calculate({period: 12, values: closes}));
    if (active.includes('bb')) {
        const bb = TI.BollingerBands.calculate({period: 20, stdDev: 2, values: closes});
        // bb is array of objects
        const diff = closes.length - bb.length;
        const pad = Array(diff).fill({upper:null, lower:null});
        indicators.bb = pad.concat(bb);
    }
    if (active.includes('rsi'))
        indicators.rsi = align(TI.RSI.calculate({period: 14, values: closes}));
    if (active.includes('macd')) {
        const m = TI.MACD.calculate({values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false});
        const diff = closes.length - m.length;
        const pad = Array(diff).fill({MACD:null, signal:null, histogram:null});
        indicators.macd = pad.concat(m);
    }

    renderChart(active, indicators);
}

function renderChart(activeIndicators, indData) {
    const data = appState.chartData;
    const x = data.map(d => d.time);
    const closes = data.map(d => d.close);

    const traces = [];

    // Main Candle
    traces.push({
        x: x, open: data.map(d => d.open), high: data.map(d => d.high), low: data.map(d => d.low), close: closes,
        type: 'candlestick', name: 'Price',
        increasing: {line: {color: '#10b981'}}, decreasing: {line: {color: '#ef4444'}},
        line: { width: 1 } // Hide whisker outline if wanted
    });

    // Overlays
    if (activeIndicators.includes('sma20'))
        traces.push({x: x, y: indData.sma20, type:'scatter', mode:'lines', line:{color:'#fbbf24', width:1}, name:'SMA 20'});
    if (activeIndicators.includes('sma50'))
        traces.push({x: x, y: indData.sma50, type:'scatter', mode:'lines', line:{color:'#3b82f6', width:1}, name:'SMA 50'});
    if (activeIndicators.includes('ema12'))
        traces.push({x: x, y: indData.ema12, type:'scatter', mode:'lines', line:{color:'#06b6d4', width:1}, name:'EMA 12'});
    if (activeIndicators.includes('bb')) {
        const upper = indData.bb.map(b => b ? b.upper : null);
        const lower = indData.bb.map(b => b ? b.lower : null);
        traces.push({x: x, y: upper, type:'scatter', mode:'lines', line:{color:'rgba(255,255,255,0.3)', width:1, dash:'dot'}, name:'BB Upper', showlegend: false});
        traces.push({x: x, y: lower, type:'scatter', mode:'lines', line:{color:'rgba(255,255,255,0.3)', width:1, dash:'dot'}, name:'Bollinger', fill:'tonexty', fillcolor:'rgba(255,255,255,0.05)'});
    }

    // Subplots
    const hasRsi = activeIndicators.includes('rsi');
    const hasMacd = activeIndicators.includes('macd');

    const layout = {
        dragmode: 'pan',
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#8f9bba', family: 'var(--font-family)' },
        grid: { rows: 1, columns: 1, pattern: 'independent' },
        showlegend: false, // Cleaner look
        margin: { l: 50, r: 40, t: 20, b: 40 },
        xaxis: { type: 'date', rangeslider: {visible: false}, gridcolor: '#2b3542' },
        yaxis: { autorange: true, gridcolor: '#2b3542', tickformat: '.2f' },
        hovermode: 'x unified'
    };

    // Domain Logic
    let rowCount = 1;
    let domains = [[0, 1]];

    if (hasRsi && hasMacd) {
        layout.grid.rows = 3;
        domains = [[0.45, 1], [0.25, 0.40], [0, 0.20]];
    } else if (hasRsi || hasMacd) {
        layout.grid.rows = 2;
        domains = [[0.35, 1], [0, 0.25]];
    }

    // Assign Axes
    traces.forEach(t => {
        if (!['RSI', 'MACD', 'MACD Hist', 'Signal'].includes(t.name)) {
            t.xaxis = 'x';
            t.yaxis = 'y';
        }
    });
    layout.yaxis.domain = domains[0];

    let currentRow = 2;

    if (hasRsi) {
        traces.push({
            x: x, y: indData.rsi, type:'scatter', mode:'lines', line:{color:'#a855f7', width:1}, name:'RSI',
            xaxis: 'x', yaxis: `y${currentRow}`
        });

        // Thresholds
        traces.push({x:[x[0], x[x.length-1]], y:[70,70], mode:'lines', line:{color:'rgba(255,255,255,0.2)', dash:'dash'}, xaxis:'x', yaxis:`y${currentRow}`, showlegend:false, hoverinfo:'skip'});
        traces.push({x:[x[0], x[x.length-1]], y:[30,30], mode:'lines', line:{color:'rgba(255,255,255,0.2)', dash:'dash'}, xaxis:'x', yaxis:`y${currentRow}`, showlegend:false, hoverinfo:'skip'});

        layout[`yaxis${currentRow}`] = { domain: domains[1], range:[0,100], gridcolor:'#2b3542', title:'RSI' };
        currentRow++;
    }

    if (hasMacd) {
        const m = indData.macd;
        const idx = hasRsi ? 2 : 1;
        const yName = `y${currentRow}`;

        traces.push({x:x, y:m.map(v=>v?v.histogram:null), type:'bar', marker:{color:'rgba(255,255,255,0.3)'}, name:'MACD Hist', xaxis:'x', yaxis:yName});
        traces.push({x:x, y:m.map(v=>v?v.MACD:null), type:'scatter', mode:'lines', line:{color:'#3b82f6', width:1}, name:'MACD', xaxis:'x', yaxis:yName});
        traces.push({x:x, y:m.map(v=>v?v.signal:null), type:'scatter', mode:'lines', line:{color:'#f97316', width:1}, name:'Signal', xaxis:'x', yaxis:yName});

        layout[`yaxis${currentRow}`] = { domain: domains[idx], gridcolor:'#2b3542', title:'MACD' };
    }

    Plotly.newPlot('main-plot', traces, layout, {displayModeBar: false, scrollZoom: true, responsive: true});
}

function updateGauge(score, rating) {
    const color = getRatingColor(score);

    const data = [{
        type: "indicator",
        mode: "gauge",
        value: score,
        gauge: {
            axis: { range: [0, 100], visible: false },
            bar: { color: color, thickness: 1 }, // Fill the whole arc with the current color? No, standard gauge
            bgcolor: "#232b36",
            borderwidth: 0,
            steps: [
                { range: [0, 25], color: "#ef4444" },
                { range: [25, 45], color: "#f97316" },
                { range: [45, 55], color: "#fbbf24" },
                { range: [55, 75], color: "#84cc16" },
                { range: [75, 100], color: "#10b981" }
            ],
            threshold: {
                line: { color: "white", width: 4 },
                thickness: 0.75,
                value: score
            }
        }
    }];

    const layout = {
        margin: { t: 0, b: 0, l: 20, r: 20 },
        paper_bgcolor: "rgba(0,0,0,0)",
        height: 150
    };

    Plotly.newPlot('fg-gauge', data, layout, {displayModeBar: false});
}

function getRatingColor(score) {
    if (score < 25) return "#ef4444";
    if (score < 45) return "#f97316";
    if (score < 55) return "#fbbf24";
    if (score < 75) return "#84cc16";
    return "#10b981";
}

// Start
init();
