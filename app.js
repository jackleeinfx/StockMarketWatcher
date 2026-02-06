// --- Constants & Config ---
const PROXY_URL = "https://api.allorigins.win/raw?url=";
const CNN_FG_URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";
const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/";

// Ticker Tape Assets
const TAPE_TICKERS = ["SPY", "QQQ", "DIA", "BTC-USD", "ETH-USD", "GC=F", "CL=F"];

// State
let appState = {
    symbol: "SPY",
    range: "1mo",
    interval: "1d",
    chartData: null,
    indicators: []
};

// DOM Elements
const els = {
    tape: document.getElementById('ticker-tape'),
    assetSelect: document.getElementById('asset-type-select'),
    symbolInput: document.getElementById('symbol-input'),
    searchBtn: document.getElementById('search-btn'),

    // Chart
    chartSymbol: document.getElementById('chart-symbol'),
    timeDisplay: document.getElementById('chart-time-display'),
    timeButtons: document.querySelectorAll('.range-btn'),
    indicatorChecks: document.querySelectorAll('#indicator-controls input'),

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
    initTickerTape();
    loadFearAndGreed();

    // Initial Load
    await loadMainChart();

    // Event Listeners
    els.searchBtn.addEventListener('click', handleSearch);
    els.symbolInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });

    // Asset Select Shortcut
    els.assetSelect.addEventListener('change', () => {
        // Just focus search, optional: auto-populate symbols
        els.symbolInput.focus();
    });

    // Time Range
    els.timeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update UI
            els.timeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update State
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
    els.tape.innerHTML = ""; // clear loading

    // Fetch one by one to avoid complexity, or try batch if possible?
    // Yahoo Chart API handles single symbol.
    // We will do parallel fetch.

    const promises = TAPE_TICKERS.map(sym =>
        fetchJson(`${YAHOO_CHART_URL}${sym}?range=1d&interval=1d`)
            .then(data => {
                const meta = data.chart.result[0].meta;
                // Fallback for previous close if missing (e.g. crypto sometimes)
                const prev = meta.previousClose || meta.chartPreviousClose || meta.regularMarketPrice;
                return {
                    symbol: sym,
                    price: meta.regularMarketPrice,
                    prev: prev
                };
            })
            .catch(e => null)
    );

    const results = await Promise.all(promises);

    // Duplicate list to make scrolling look continuous if list is short
    const displayList = [...results, ...results];

    displayList.forEach(item => {
        if (!item) return;

        let change = 0;
        let pct = 0;

        if (item.prev && item.prev > 0) {
            change = item.price - item.prev;
            pct = (change / item.prev) * 100;
        }

        const colorClass = change >= 0 ? "up" : "down";
        const sign = change >= 0 ? "+" : "";

        const div = document.createElement('div');
        div.className = 'ticker-item';
        div.innerHTML = `
            ${item.symbol}
            <span class="${colorClass}">
                ${item.price.toFixed(2)} (${sign}${pct.toFixed(2)}%)
            </span>
        `;
        els.tape.appendChild(div);
    });
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

async function handleSearch() {
    const val = els.symbolInput.value.trim().toUpperCase();
    if (val) {
        appState.symbol = val;
        await loadMainChart();
    }
}

async function loadMainChart() {
    els.chartSymbol.innerHTML = `<span style="color:var(--text-muted)">LOADING...</span>`;

    const { symbol, range, interval } = appState;
    const url = `${YAHOO_CHART_URL}${symbol}?range=${range}&interval=${interval}`;

    try {
        const data = await fetchJson(url);
        const res = data.chart.result[0];
        const quote = res.indicators.quote[0];
        const timestamps = res.timestamp;

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
        els.timeDisplay.textContent = last.time.toLocaleString();

        // Update Quote Card
        updateQuoteCard(cleanData);
        updateStatsCard(cleanData);

        // Calc Indicators & Render
        // Wrap in try-catch to prevent chart crash if indicators fail (e.g. not enough data)
        try {
            updateIndicators();
        } catch (indError) {
            console.error("Indicator Error:", indError);
            // Fallback: render basic chart without indicators
            renderChart([], {});
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
    const change = cur.close - prev.close;
    const pct = (change / prev.close) * 100;

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

    if (active.includes('sma20'))
        indicators.sma20 = align(technicalIndicators.SMA.calculate({period: 20, values: closes}));
    if (active.includes('sma50'))
        indicators.sma50 = align(technicalIndicators.SMA.calculate({period: 50, values: closes}));
    if (active.includes('ema12'))
        indicators.ema12 = align(technicalIndicators.EMA.calculate({period: 12, values: closes}));
    if (active.includes('bb')) {
        const bb = technicalIndicators.BollingerBands.calculate({period: 20, stdDev: 2, values: closes});
        // bb is array of objects
        const diff = closes.length - bb.length;
        const pad = Array(diff).fill({upper:null, lower:null});
        indicators.bb = pad.concat(bb);
    }
    if (active.includes('rsi'))
        indicators.rsi = align(technicalIndicators.RSI.calculate({period: 14, values: closes}));
    if (active.includes('macd')) {
        const m = technicalIndicators.MACD.calculate({values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false});
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
