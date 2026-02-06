import plotly.graph_objects as go
from plotly.subplots import make_subplots

def create_candlestick_chart(df, ticker, indicators=[]):
    """
    Creates a Plotly candlestick chart with selected indicators.

    Args:
        df (pd.DataFrame): DataFrame with stock data and indicators.
        ticker (str): Ticker symbol.
        indicators (list): List of indicators to show (e.g., ['SMA_20', 'RSI', 'Bollinger Bands']).

    Returns:
        go.Figure: The Plotly figure.
    """
    # Determine rows for subplots
    rows = 2 # Main + Volume
    row_heights = [0.7, 0.3]

    has_rsi = 'RSI' in indicators
    has_macd = 'MACD' in indicators

    if has_rsi:
        rows += 1
        row_heights = [0.6, 0.15, 0.25]
    if has_macd:
        rows += 1
        if has_rsi:
            row_heights = [0.5, 0.15, 0.15, 0.2]
        else:
            row_heights = [0.6, 0.15, 0.25]

    # Adjust last height if multiple
    # Simplifying logic:
    # Row 1: Price (Candles + Overlays)
    # Row 2: Volume
    # Row 3: RSI (Optional)
    # Row 4: MACD (Optional)

    specs = [[{"secondary_y": False}]] * rows

    fig = make_subplots(
        rows=rows,
        cols=1,
        shared_xaxes=True,
        vertical_spacing=0.05,
        row_heights=row_heights
    )

    # 1. Candlestick
    fig.add_trace(go.Candlestick(
        x=df.index,
        open=df['Open'],
        high=df['High'],
        low=df['Low'],
        close=df['Close'],
        name='Price'
    ), row=1, col=1)

    # Overlays on Row 1
    if 'SMA_20' in indicators and 'SMA_20' in df.columns:
        fig.add_trace(go.Scatter(x=df.index, y=df['SMA_20'], line=dict(color='orange', width=1), name='SMA 20'), row=1, col=1)
    if 'SMA_50' in indicators and 'SMA_50' in df.columns:
        fig.add_trace(go.Scatter(x=df.index, y=df['SMA_50'], line=dict(color='blue', width=1), name='SMA 50'), row=1, col=1)
    if 'SMA_200' in indicators and 'SMA_200' in df.columns:
        fig.add_trace(go.Scatter(x=df.index, y=df['SMA_200'], line=dict(color='purple', width=1), name='SMA 200'), row=1, col=1)

    if 'Bollinger Bands' in indicators:
        # Assuming standard pandas_ta naming: BBL_20_2.0, BBU_20_2.0
        # Check columns
        bbu = [c for c in df.columns if c.startswith('BBU_')]
        bbl = [c for c in df.columns if c.startswith('BBL_')]
        if bbu and bbl:
            fig.add_trace(go.Scatter(x=df.index, y=df[bbu[0]], line=dict(color='gray', width=1, dash='dot'), name='BBU'), row=1, col=1)
            fig.add_trace(go.Scatter(x=df.index, y=df[bbl[0]], line=dict(color='gray', width=1, dash='dot'), fill='tonexty', name='BBL'), row=1, col=1)

    # 2. Volume
    fig.add_trace(go.Bar(x=df.index, y=df['Volume'], name='Volume', marker_color='teal'), row=2, col=1)

    current_row = 3

    # 3. RSI
    if has_rsi and 'RSI' in df.columns:
        fig.add_trace(go.Scatter(x=df.index, y=df['RSI'], line=dict(color='purple', width=2), name='RSI'), row=current_row, col=1)
        # Add 30/70 lines
        fig.add_hline(y=70, line_dash="dash", line_color="red", row=current_row, col=1)
        fig.add_hline(y=30, line_dash="dash", line_color="green", row=current_row, col=1)
        current_row += 1

    # 4. MACD
    if has_macd:
        # Find MACD columns
        macd_col = [c for c in df.columns if c.startswith('MACD_')]
        macds_col = [c for c in df.columns if c.startswith('MACDs_')]
        macdh_col = [c for c in df.columns if c.startswith('MACDh_')]

        if macd_col and macds_col and macdh_col:
            fig.add_trace(go.Bar(x=df.index, y=df[macdh_col[0]], name='MACD Hist', marker_color='gray'), row=current_row, col=1)
            fig.add_trace(go.Scatter(x=df.index, y=df[macd_col[0]], line=dict(color='blue', width=1), name='MACD'), row=current_row, col=1)
            fig.add_trace(go.Scatter(x=df.index, y=df[macds_col[0]], line=dict(color='orange', width=1), name='Signal'), row=current_row, col=1)

    fig.update_layout(
        title=f"{ticker} Candlestick Chart",
        xaxis_rangeslider_visible=False,
        height=800,
        template="plotly_dark"
    )

    return fig

def create_gauge_chart(value, title="Fear & Greed Index"):
    """
    Creates a Gauge chart for the Fear & Greed Index.
    """
    if value is None:
        return go.Figure()

    fig = go.Figure(go.Indicator(
        mode = "gauge+number",
        value = value,
        domain = {'x': [0, 1], 'y': [0, 1]},
        title = {'text': title},
        gauge = {
            'axis': {'range': [0, 100], 'tickwidth': 1, 'tickcolor': "white"},
            'bar': {'color': "darkblue"},
            'bgcolor': "white",
            'borderwidth': 2,
            'bordercolor': "gray",
            'steps': [
                {'range': [0, 25], 'color': 'red'},        # Extreme Fear
                {'range': [25, 45], 'color': 'orange'},    # Fear
                {'range': [45, 55], 'color': 'yellow'},    # Neutral
                {'range': [55, 75], 'color': 'lightgreen'},# Greed
                {'range': [75, 100], 'color': 'green'}     # Extreme Greed
            ],
            'threshold': {
                'line': {'color': "black", 'width': 4},
                'thickness': 0.75,
                'value': value
            }
        }
    ))

    fig.update_layout(
        height=300,
        margin=dict(l=20, r=20, t=50, b=20),
        template="plotly_dark"
    )

    return fig
