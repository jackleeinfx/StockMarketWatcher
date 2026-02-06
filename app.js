// Constants
const PROXY_URL = "https://api.allorigins.win/raw?url=";
const CNN_API_URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";
const YAHOO_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart/";

// Ticker Maps
const TICKERS = {
    indices: ["SPY", "QQQ", "DIA", "IWM", "VOO", "TLT"],
    futures: ["ES=F", "NQ=F", "YM=F", "CL=F", "GC=F", "SI=F", "NG=F", "HG=F", "ZB=F"],
    crypto: ["BTC-USD", "ETH-USD", "SOL-USD", "DOGE-USD", "XRP-USD"],
    tech: ["AAPL", "NVDA", "MSFT", "TSLA", "GOOGL", "AMZN", "META", "AMD", "NFLX"]
};

// State
let currentData = null;
let currentIndicators = {};

// DOM Elements
const els = {
    assetClass: document.getElementById('asset-class'),
    tickerSelect: document.getElementById('ticker-select'),
    tickerInput: document.getElementById('ticker-input'),
    tickerGroup: document.getElementById('ticker-group'),
    period: document.getElementById('period'),
    interval: document.getElementById('interval'),
    refreshBtn: document.getElementById('refresh-btn'),
    status: document.getElementById('status-msg'),
    chartTitle: document.getElementById('chart-title'),
    priceCurrent: document.getElementById('price-current'),
    priceChange: document.getElementById('price-change'),
    indicatorChecks: document.querySelectorAll('.checkbox-group input'),
    historyList: document.getElementById('fg-history-list'),
    fgTimestamp: document.getElementById('fg-timestamp')
};

// --- Initialization ---
function init() {
    updateTickerOptions();

    // Event Listeners
    els.assetClass.addEventListener('change', () => {
        updateTickerOptions();
        loadData();
    });

    els.tickerSelect.addEventListener('change', loadData);
    els.tickerInput.addEventListener('change', loadData); // For custom input
    els.period.addEventListener('change', loadData);
    els.interval.addEventListener('change', loadData);
    els.refreshBtn.addEventListener('click', loadData);

    els.indicatorChecks.forEach(cb => {
        cb.addEventListener('change', renderMainChart);
    });

    // Initial Load
    loadData();
}

function updateTickerOptions() {
    const type = els.assetClass.value;
    els.tickerSelect.innerHTML = '';

    if (type === 'custom') {
        els.tickerSelect.style.display = 'none';
        els.tickerInput.style.display = 'block';
    } else {
        els.tickerSelect.style.display = 'block';
        els.tickerInput.style.display = 'none';

        TICKERS[type].forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            els.tickerSelect.appendChild(opt);
        });
    }
}

function getTicker() {
    return els.assetClass.value === 'custom' ? els.tickerInput.value.toUpperCase() : els.tickerSelect.value;
}

// --- Data Fetching ---

async function fetchWithProxy(targetUrl) {
    const url = PROXY_URL + encodeURIComponent(targetUrl);
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Proxy Fetch Error:", error);
        throw error;
    }
}

async function loadData() {
    els.status.textContent = "Loading...";
    els.refreshBtn.disabled = true;

    const ticker = getTicker();
    if (!ticker) return;

    try {
        await Promise.all([
            loadStockData(ticker),
            loadFearAndGreed()
        ]);
        els.status.textContent = "";
    } catch (error) {
        els.status.textContent = "Error loading data. See console.";
        console.error(error);
    } finally {
        els.refreshBtn.disabled = false;
    }
}

async function loadStockData(ticker) {
    const range = els.period.value;
    const interval = els.interval.value;
    const url = `${YAHOO_BASE_URL}${ticker}?range=${range}&interval=${interval}`;

    try {
        const data = await fetchWithProxy(url);
        const result = data.chart.result[0];

        if (!result) throw new Error("No data found");

        const quote = result.indicators.quote[0];
        const timestamps = result.timestamp;

        // Parse into simpler format
        const prices = timestamps.map((t, i) => ({
            time: new Date(t * 1000),
            open: quote.open[i],
            high: quote.high[i],
            low: quote.low[i],
            close: quote.close[i],
            volume: quote.volume[i]
        })).filter(p => p.close !== null); // Filter out nulls

        currentData = prices;
        els.chartTitle.textContent = `Analysis: ${ticker}`;

        // Metrics
        const latest = prices[prices.length - 1];
        const prev = prices[prices.length - 2];
        const change = latest.close - prev.close;
        const pct = (change / prev.close) * 100;

        els.priceCurrent.textContent = latest.close.toFixed(2);
        els.priceChange.textContent = `${change > 0 ? '+' : ''}${change.toFixed(2)} (${pct.toFixed(2)}%)`;
        els.priceChange.className = change >= 0 ? 'positive' : 'negative';

        calculateIndicators(prices);
        renderMainChart();

    } catch (error) {
        console.error("Stock Fetch Error:", error);
        els.status.textContent = "Failed to load stock data.";
    }
}

async function loadFearAndGreed() {
    try {
        const data = await fetchWithProxy(CNN_API_URL);
        const fg = data.fear_and_greed;

        renderGauge(fg.score, fg.rating);
        renderHistory(fg);

    } catch (error) {
        console.error("F&G Fetch Error:", error);
        // Don't clear status if stock loaded ok
    }
}

function renderHistory(fg) {
    els.historyList.innerHTML = `
        <li><strong>Current:</strong> ${fg.score.toFixed(2)} (${fg.rating})</li>
        <li><strong>Previous Close:</strong> ${fg.previous_close.toFixed(2)}</li>
        <li><strong>1 Week Ago:</strong> ${fg.previous_1_week.toFixed(2)}</li>
        <li><strong>1 Month Ago:</strong> ${fg.previous_1_month.toFixed(2)}</li>
        <li><strong>1 Year Ago:</strong> ${fg.previous_1_year.toFixed(2)}</li>
    `;
    els.fgTimestamp.textContent = `Updated: ${fg.timestamp}`;
}

// --- Indicators ---

function calculateIndicators(data) {
    const closes = data.map(d => d.close);

    // Reset
    currentIndicators = {};

    // Helper to pad results with nulls to match data length
    // technicalindicators library returns array usually shorter than input
    const align = (res, inputLen) => {
        const diff = inputLen - res.length;
        return Array(diff).fill(null).concat(res);
    };

    // SMA
    currentIndicators.sma20 = align(technicalIndicators.SMA.calculate({period: 20, values: closes}), closes.length);
    currentIndicators.sma50 = align(technicalIndicators.SMA.calculate({period: 50, values: closes}), closes.length);

    // EMA
    currentIndicators.ema12 = align(technicalIndicators.EMA.calculate({period: 12, values: closes}), closes.length);

    // RSI
    currentIndicators.rsi = align(technicalIndicators.RSI.calculate({period: 14, values: closes}), closes.length);

    // MACD
    const macdRes = technicalIndicators.MACD.calculate({
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false
    });
    // MACD result is array of objects {MACD, signal, histogram}
    // We need to align it too
    const diff = closes.length - macdRes.length;
    const padding = Array(diff).fill({MACD: null, signal: null, histogram: null});
    currentIndicators.macd = padding.concat(macdRes);

    // Bollinger Bands
    const bbRes = technicalIndicators.BollingerBands.calculate({period: 20, stdDev: 2, values: closes});
    // result objects {middle, upper, lower}
    const bbDiff = closes.length - bbRes.length;
    const bbPad = Array(bbDiff).fill({upper: null, lower: null});
    currentIndicators.bb = bbPad.concat(bbRes);
}


// --- Rendering ---

function renderGauge(score, rating) {
    const data = [
        {
            type: "indicator",
            mode: "gauge+number",
            value: score,
            title: { text: `<b>${rating.toUpperCase()}</b>`, font: { size: 24 } },
            gauge: {
                axis: { range: [0, 100], tickwidth: 1, tickcolor: "white" },
                bar: { color: "darkblue" },
                bgcolor: "white",
                borderwidth: 2,
                bordercolor: "gray",
                steps: [
                    { range: [0, 25], color: "red" },
                    { range: [25, 45], color: "orange" },
                    { range: [45, 55], color: "yellow" },
                    { range: [55, 75], color: "lightgreen" },
                    { range: [75, 100], color: "green" }
                ],
                threshold: {
                    line: { color: "black", width: 4 },
                    thickness: 0.75,
                    value: score
                }
            }
        }
    ];

    const layout = {
        margin: { t: 25, r: 25, l: 25, b: 25 },
        paper_bgcolor: "#1e1e1e",
        font: { color: "white" }
    };

    Plotly.newPlot('gauge-chart', data, layout, {displayModeBar: false});
}

function renderMainChart() {
    if (!currentData) return;

    const active = Array.from(els.indicatorChecks)
        .filter(cb => cb.checked)
        .map(cb => cb.value);

    const x = currentData.map(d => d.time);
    const open = currentData.map(d => d.open);
    const high = currentData.map(d => d.high);
    const low = currentData.map(d => d.low);
    const close = currentData.map(d => d.close);

    const traces = [];

    // 1. Candlestick
    traces.push({
        x: x,
        close: close,
        decreasing: {line: {color: '#ef5350'}},
        high: high,
        increasing: {line: {color: '#26a69a'}},
        line: {color: 'rgba(31,119,180,1)'},
        low: low,
        open: open,
        type: 'candlestick',
        xaxis: 'x',
        yaxis: 'y',
        name: 'Price'
    });

    // Overlays
    if (active.includes('sma20')) {
        traces.push({ x: x, y: currentIndicators.sma20, type: 'scatter', mode: 'lines', line: {color: 'orange', width: 1}, name: 'SMA 20' });
    }
    if (active.includes('sma50')) {
        traces.push({ x: x, y: currentIndicators.sma50, type: 'scatter', mode: 'lines', line: {color: 'blue', width: 1}, name: 'SMA 50' });
    }
    if (active.includes('ema12')) {
        traces.push({ x: x, y: currentIndicators.ema12, type: 'scatter', mode: 'lines', line: {color: 'cyan', width: 1}, name: 'EMA 12' });
    }
    if (active.includes('bb')) {
        const upper = currentIndicators.bb.map(b => b ? b.upper : null);
        const lower = currentIndicators.bb.map(b => b ? b.lower : null);
        traces.push({ x: x, y: upper, type: 'scatter', mode: 'lines', line: {color: 'gray', width: 0, dash: 'dot'}, showlegend: false, name: 'BBU' });
        traces.push({ x: x, y: lower, type: 'scatter', mode: 'lines', line: {color: 'gray', width: 0, dash: 'dot'}, fill: 'tonexty', fillcolor: 'rgba(128,128,128,0.2)', name: 'Bollinger' });
    }

    // Subplots logic
    const hasRsi = active.includes('rsi');
    const hasMacd = active.includes('macd');

    // Layout Calculation
    // Grid:
    // Row 1: Price (Main) - Domain depends on subplots
    // Row 2: RSI (Optional)
    // Row 3: MACD (Optional)

    const layout = {
        dragmode: 'zoom',
        showlegend: true,
        xaxis: { rangeslider: { visible: false }, type: 'date', gridcolor: '#333' },
        yaxis: { autorange: true, gridcolor: '#333', title: 'Price' },
        paper_bgcolor: '#1e1e1e',
        plot_bgcolor: '#1e1e1e',
        font: { color: '#ccc' },
        margin: {l: 50, r: 20, t: 30, b: 30},
        grid: { rows: 1, columns: 1, pattern: 'independent' },
        height: 600
    };

    let currentRow = 1;
    let domains = [];

    if (hasRsi && hasMacd) {
        layout.grid.rows = 3;
        domains = [[0.55, 1], [0.30, 0.50], [0, 0.25]]; // Main, RSI, MACD
    } else if (hasRsi || hasMacd) {
        layout.grid.rows = 2;
        domains = [[0.35, 1], [0, 0.30]]; // Main, Sub
    } else {
        domains = [[0, 1]];
    }

    // Assign Price Trace
    traces.forEach(t => {
        if (!['rsi', 'macd', 'signal', 'hist'].includes(t.name)) {
            t.xaxis = 'x';
            t.yaxis = 'y';
        }
    });
    layout.yaxis.domain = domains[0];

    // RSI
    if (hasRsi) {
        currentRow++;
        const yAxisName = `y${currentRow}`;
        const xAxisName = `x${currentRow}`; // Shared X usually, but Plotly needs linkage

        traces.push({
            x: x, y: currentIndicators.rsi, type: 'scatter', mode: 'lines',
            line: {color: 'purple', width: 2}, name: 'RSI',
            yaxis: yAxisName, xaxis: 'x' // Share x axis
        });

        // Lines 30/70
        // Plotly shapes are absolute, simpler to just add invisible traces or lines
        // For simplicity in JS dynamic layout, just traces
        // Or using shapes:
        layout.shapes = [
            { type: 'line', x0: x[0], x1: x[x.length-1], y0: 70, y1: 70, xref: 'x', yref: yAxisName, line: {color: 'red', width: 1, dash: 'dash'} },
            { type: 'line', x0: x[0], x1: x[x.length-1], y0: 30, y1: 30, xref: 'x', yref: yAxisName, line: {color: 'green', width: 1, dash: 'dash'} }
        ];

        layout[`yaxis${currentRow}`] = {
            domain: domains[1],
            range: [0, 100],
            gridcolor: '#333',
            title: 'RSI'
        };
    }

    // MACD
    if (hasMacd) {
        const rowIdx = hasRsi ? 2 : 1;
        currentRow++;
        const yAxisName = `y${currentRow}`;

        const macdData = currentIndicators.macd;
        traces.push({
            x: x, y: macdData.map(m => m.histogram), type: 'bar',
            marker: {color: 'gray'}, name: 'MACD Hist',
            yaxis: yAxisName, xaxis: 'x'
        });
        traces.push({
            x: x, y: macdData.map(m => m.MACD), type: 'scatter', mode: 'lines',
            line: {color: 'blue', width: 1}, name: 'MACD',
            yaxis: yAxisName, xaxis: 'x'
        });
        traces.push({
            x: x, y: macdData.map(m => m.signal), type: 'scatter', mode: 'lines',
            line: {color: 'orange', width: 1}, name: 'Signal',
            yaxis: yAxisName, xaxis: 'x'
        });

        layout[`yaxis${currentRow}`] = {
            domain: domains[rowIdx],
            gridcolor: '#333',
            title: 'MACD'
        };
    }

    Plotly.newPlot('main-chart', traces, layout, {displayModeBar: false, responsive: true});
}

// Start
init();
