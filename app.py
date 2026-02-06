import streamlit as st
import pandas as pd
from utils.data import get_stock_data, get_fear_and_greed_index
from utils.indicators import add_technical_indicators
from utils.charts import create_candlestick_chart, create_gauge_chart

st.set_page_config(layout="wide", page_title="Market Observer")

# Custom CSS for styling
st.markdown("""
<style>
    .metric-card {
        background-color: #1e1e1e;
        padding: 15px;
        border-radius: 10px;
        box-shadow: 2px 2px 10px rgba(0,0,0,0.5);
    }
</style>
""", unsafe_allow_html=True)

# Sidebar
st.sidebar.title("Market Settings")

asset_class = st.sidebar.selectbox(
    "Asset Class",
    ["Indices (ETF)", "Futures", "Crypto", "Big Tech", "Custom"]
)

tickers_map = {
    "Indices (ETF)": ["SPY", "QQQ", "DIA", "IWM", "VOO", "TLT"],
    "Futures": ["ES=F", "NQ=F", "YM=F", "CL=F", "GC=F", "SI=F", "NG=F", "HG=F", "ZB=F"],
    "Crypto": ["BTC-USD", "ETH-USD", "SOL-USD", "DOGE-USD", "XRP-USD"],
    "Big Tech": ["AAPL", "NVDA", "MSFT", "TSLA", "GOOGL", "AMZN", "META", "AMD", "NFLX"]
}

if asset_class == "Custom":
    ticker = st.sidebar.text_input("Enter Ticker Symbol", value="SPY").upper()
else:
    ticker = st.sidebar.selectbox("Select Symbol", tickers_map[asset_class])

st.sidebar.markdown("---")
st.sidebar.subheader("Chart Settings")

period = st.sidebar.selectbox("Period", ["1mo", "3mo", "6mo", "1y", "2y", "5y", "max"], index=3)
interval = st.sidebar.selectbox("Interval", ["1d", "1wk", "1mo"], index=0)

indicators = st.sidebar.multiselect(
    "Technical Indicators",
    ["SMA_20", "SMA_50", "SMA_200", "EMA_12", "EMA_26", "Bollinger Bands", "RSI", "MACD"],
    default=["SMA_20", "RSI"]
)

# Main Content
st.title("📈 Custom Market Observer")

# 1. Fear & Greed Section
st.header("CNN Fear & Greed Index")
col_fg1, col_fg2 = st.columns([1, 2])

fg_data = get_fear_and_greed_index()

with col_fg1:
    if fg_data:
        score = fg_data.get('score')
        rating_str = fg_data.get('rating')
        rating = rating_str.title() if rating_str else "Unknown"
        fig_gauge = create_gauge_chart(score, title=f"Current: {rating}")
        st.plotly_chart(fig_gauge, use_container_width=True)
    else:
        st.error("Unable to load Fear & Greed Index")

with col_fg2:
    if fg_data:
        st.markdown("### Historical Context")
        st.markdown(f"""
        - **Current Score:** {fg_data.get('score'):.2f} ({fg_data.get('rating')})
        - **Previous Close:** {fg_data.get('previous_close'):.2f}
        - **1 Week Ago:** {fg_data.get('previous_1_week'):.2f}
        - **1 Month Ago:** {fg_data.get('previous_1_month'):.2f}
        - **1 Year Ago:** {fg_data.get('previous_1_year'):.2f}
        """)
        st.caption(f"Last Updated: {fg_data.get('timestamp')}")

st.markdown("---")

# 2. Market Data Section
st.header(f"Analysis: {ticker}")

# Fetch Data
with st.spinner(f"Loading data for {ticker}..."):
    df = get_stock_data(ticker, period=period, interval=interval)

if not df.empty:
    # Calculate Indicators
    df = add_technical_indicators(df)

    # Display Metrics (Latest Price)
    latest = df.iloc[-1]
    prev = df.iloc[-2]

    price = latest['Close']
    change = price - prev['Close']
    pct_change = (change / prev['Close']) * 100

    col_metric1, col_metric2, col_metric3 = st.columns(3)
    col_metric1.metric("Current Price", f"{price:.2f}", f"{change:.2f} ({pct_change:.2f}%)")
    col_metric2.metric("High", f"{latest['High']:.2f}")
    col_metric3.metric("Low", f"{latest['Low']:.2f}")

    # Charts
    fig_chart = create_candlestick_chart(df, ticker, indicators)
    st.plotly_chart(fig_chart, use_container_width=True)

    # Raw Data Expander
    with st.expander("View Raw Data"):
        st.dataframe(df.tail(20))
else:
    st.error(f"No data found for {ticker}. Please check the symbol or try again.")
