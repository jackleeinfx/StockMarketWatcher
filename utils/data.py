import yfinance as yf
import requests
import pandas as pd
from datetime import datetime

def get_stock_data(ticker, period="1y", interval="1d"):
    """
    Fetches historical stock data using yfinance.

    Args:
        ticker (str): The stock symbol (e.g., "SPY", "BTC-USD").
        period (str): The data period to download (default: "1y").
        interval (str): The data interval (default: "1d").

    Returns:
        pd.DataFrame: A DataFrame with Open, High, Low, Close, Volume data.
                      Returns empty DataFrame if failed.
    """
    try:
        df = yf.download(ticker, period=period, interval=interval, progress=False)
        if df.empty:
            print(f"Warning: No data found for {ticker}")
        return df
    except Exception as e:
        print(f"Error fetching stock data for {ticker}: {e}")
        return pd.DataFrame()

def get_fear_and_greed_index():
    """
    Fetches the Fear & Greed Index from CNN.

    Returns:
        dict: A dictionary containing 'score', 'rating', 'timestamp', and trend data.
              Returns None if request fails.
    """
    url = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }

    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            data = response.json()
            fg_data = data.get("fear_and_greed", {})
            return {
                "score": fg_data.get("score"),
                "rating": fg_data.get("rating"),
                "timestamp": fg_data.get("timestamp"),
                "previous_close": fg_data.get("previous_close"),
                "previous_1_week": fg_data.get("previous_1_week"),
                "previous_1_month": fg_data.get("previous_1_month"),
                "previous_1_year": fg_data.get("previous_1_year")
            }
        else:
            print(f"Error fetching Fear & Greed Index: Status {response.status_code}")
            return None
    except Exception as e:
        print(f"Exception fetching Fear & Greed Index: {e}")
        return None
