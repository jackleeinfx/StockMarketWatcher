from utils.data import get_stock_data, get_fear_and_greed_index
from utils.indicators import add_technical_indicators
from utils.charts import create_candlestick_chart, create_gauge_chart
import pandas as pd

def test_backend():
    print("Testing Backend...")

    # 1. Test Stock Data
    print("1. Fetching SPY data...")
    df = get_stock_data("SPY", period="1mo", interval="1d")
    if df.empty:
        print("FAIL: SPY data is empty.")
        return
    print(f"SUCCESS: Fetched {len(df)} rows for SPY.")

    # 2. Test Fear & Greed
    print("2. Fetching Fear & Greed...")
    fg_data = get_fear_and_greed_index()
    if fg_data:
        print(f"SUCCESS: Fear & Greed Score: {fg_data.get('score')}")
    else:
        print("FAIL: Fear & Greed data is None.")

    # 3. Test Indicators
    print("3. Adding Indicators...")
    df = add_technical_indicators(df)
    cols = df.columns
    if 'SMA_20' in cols and 'RSI' in cols:
        print("SUCCESS: Indicators added.")
    else:
        print(f"FAIL: Indicators missing. Columns: {cols}")

    # 4. Test Charts
    print("4. Generating Charts...")
    try:
        fig_candle = create_candlestick_chart(df, "SPY", indicators=['SMA_20', 'RSI'])
        if fig_candle:
            print("SUCCESS: Candlestick chart object created.")

        if fg_data:
            fig_gauge = create_gauge_chart(fg_data.get('score'))
            if fig_gauge:
                print("SUCCESS: Gauge chart object created.")
    except Exception as e:
        print(f"FAIL: Chart generation error: {e}")

    print("\nBackend Test Complete.")

if __name__ == "__main__":
    test_backend()
