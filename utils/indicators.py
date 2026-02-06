import pandas_ta as ta
import pandas as pd

def add_technical_indicators(df):
    """
    Adds technical indicators to the DataFrame using pandas_ta.

    Args:
        df (pd.DataFrame): DataFrame containing stock data (Open, High, Low, Close, Volume).

    Returns:
        pd.DataFrame: DataFrame with added indicator columns.
    """
    if df is None or df.empty:
        return df

    # Ensure data is sorted by date
    df = df.sort_index()

    # Simple Moving Averages
    df['SMA_20'] = ta.sma(df['Close'], length=20)
    df['SMA_50'] = ta.sma(df['Close'], length=50)
    df['SMA_200'] = ta.sma(df['Close'], length=200)

    # Exponential Moving Averages
    df['EMA_12'] = ta.ema(df['Close'], length=12)
    df['EMA_26'] = ta.ema(df['Close'], length=26)

    # RSI
    df['RSI'] = ta.rsi(df['Close'], length=14)

    # MACD
    macd = ta.macd(df['Close'], fast=12, slow=26, signal=9)
    # MACD returns multiple columns, usually MACD_12_26_9, MACDh_12_26_9, MACDs_12_26_9
    if macd is not None:
        df = pd.concat([df, macd], axis=1)

    # Bollinger Bands
    bbands = ta.bbands(df['Close'], length=20, std=2)
    # Returns BBL_20_2.0, BBM_20_2.0, BBU_20_2.0
    if bbands is not None:
        df = pd.concat([df, bbands], axis=1)

    return df
