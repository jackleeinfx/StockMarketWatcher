import requests
import urllib.parse
import json

def verify_search():
    query = "Apple"
    target_url = f"https://query1.finance.yahoo.com/v1/finance/search?q={query}&quotesCount=5&newsCount=0"
    proxy_url = f"https://api.allorigins.win/raw?url={urllib.parse.quote(target_url)}"

    print(f"Testing Search via Proxy: {proxy_url}")
    try:
        resp = requests.get(proxy_url, timeout=10)
        print(f"Status: {resp.status_code}")

        if resp.status_code == 200:
            data = resp.json()
            quotes = data.get('quotes', [])
            print(f"Found {len(quotes)} quotes.")
            if quotes:
                print("First result:", json.dumps(quotes[0], indent=2))
                # Check for symbol and longname
                if 'symbol' in quotes[0]:
                    print("SUCCESS: Symbol found.")
                else:
                    print("FAIL: Symbol missing.")
            else:
                print("FAIL: No quotes returned.")
        else:
            print(f"Failed. Body: {resp.text[:200]}")

    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    verify_search()
