# ---------------------------------------------------------------
# load_multiple_apis_fixed.py
# ---------------------------------------------------------------
import os
import time
from typing import List, Dict

import requests
from supabase import create_client, Client
from dotenv import load_dotenv

# ---------------------------------------------------------------
# 1️⃣ Load secrets from .env
# ---------------------------------------------------------------
load_dotenv()   # reads .env into os.environ

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
)
APISPORTS_KEY = os.getenv("X_APISPORTS_KEY") or os.getenv("APISPORTS_KEY")
RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY") or os.getenv("X_RAPIDAPI_KEY")
ODDS_API_KEY = os.getenv("ODDS_API_KEY")
CRICKET_KEY   = os.getenv("CRICKETDATA_API_KEY")

if not all([SUPABASE_URL, SUPABASE_KEY]):
    raise RuntimeError("Supabase URL + key missing in .env")
if not APISPORTS_KEY:
    raise RuntimeError("X_APISPORTS_KEY missing in .env")

# ---------------------------------------------------------------
# 2️⃣ Initialise Supabase client (service‑role key needed for INSERT)
# ---------------------------------------------------------------
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ---------------------------------------------------------------
# 3️⃣ API‑Sports – sport → base URL
# ---------------------------------------------------------------
API_SPORTS_SPORTS = {
    "football": "v3.football.api-sports.io",
    "basketball": "v1.basketball.api-sports.io",
    "baseball": "v1.baseball.api-sports.io",
    "nba": "v2.nba.api-sports.io",
    "american_football": "v1.american-football.api-sports.io",
    "rugby": "v1.rugby.api-sports.io",
}
API_SPORTS_ENDPOINTS = ["teams", "leagues"]   # you can add "fixtures", etc.

# ---------------------------------------------------------------
# 4️⃣ Helper – safe GET with error printing
# ---------------------------------------------------------------
def safe_get(url: str, headers: dict = None, params: dict = None) -> dict:
    try:
        resp = requests.get(url, headers=headers or {}, params=params or {}, timeout=15)
        if resp.status_code != 200:
            try:
                err_json = resp.json()
            except Exception:
                err_json = resp.text[:200]
            print(f"❌ HTTP {resp.status_code} for {url}\n   {err_json}")
            return {}
        return resp.json()
    except requests.RequestException as exc:
        print(f"❌ Network error for {url}: {exc}")
        return {}

# ---------------------------------------------------------------
# 5️⃣ API‑Sports fetcher – **add required query params**
# ---------------------------------------------------------------
def fetch_apisports(sport: str, base: str, endpoint: str) -> List[Dict]:
    """Return a list of rows ready for Supabase insertion."""
    url = f"https://{base}/{endpoint}"

    # ---- Minimal required params per sport (change as needed) ----
    # The free tier often requires a league (or team) + a season.
    # These IDs are taken from the API‑Sports docs – replace with the IDs you need.
    default_params: Dict[str, int] = {}
    if sport == "football":
        # English Premier League = 39 (season 2023 works for the demo)
        default_params = {"league": 39, "season": 2023}
    elif sport == "basketball":
        # NBA – league ID 12, season 2023
        default_params = {"league": 12, "season": 2023}
    elif sport == "baseball":
        # MLB – league ID 1, season 2023
        default_params = {"league": 1, "season": 2023}
    elif sport == "nba":
        default_params = {"league": 12, "season": 2023}
    elif sport == "american_football":
        default_params = {"league": 1, "season": 2023}
    elif sport == "rugby":
        default_params = {"league": 1, "season": 2023}
    # Add more sports / params as you discover their IDs.

    rows: List[Dict] = []
    page = 1
    per_page = 100
    while True:
        payload = {"page": page, "per_page": per_page, **default_params}
        data = safe_get(url,
                       headers={"x-apisports-key": APISPORTS_KEY},
                       params=payload)
        items = data.get("response", [])
        if not items:          # empty => end of pagination or missing params
            break
        for item in items:
            rows.append({
                "source": "api_sports",
                "endpoint": f"{sport}/{endpoint}",
                "payload": item
            })
        if len(items) < per_page:
            break
        page += 1
        time.sleep(0.2)   # stay under free‑tier 5 req/s limit
    return rows

# ---------------------------------------------------------------
# 6️⃣ RapidAPI fetcher (replace placeholders with real host/paths)
# ---------------------------------------------------------------
def fetch_rapidapi(host: str, endpoint: str) -> List[Dict]:
    url = f"https://{host}{endpoint}"
    data = safe_get(url,
                    headers={"X-RapidAPI-Key": RAPIDAPI_KEY,
                             "X-RapidAPI-Host": host})
    items = data.get("results") or data.get("response") or data
    if not isinstance(items, list):
        items = [items] if items else []
    return [{
        "source": "rapidapi",
        "endpoint": f"{host}{endpoint}",
        "payload": it
    } for it in items]

# ---------------------------------------------------------------
# 7️⃣ Odds‑API fetcher
# ---------------------------------------------------------------
def fetch_oddsapi(endpoint: str) -> List[Dict]:
    url = f"https://api.the-odds-api.com/{endpoint}"
    data = safe_get(url, params={"apiKey": ODDS_API_KEY})
    items = data if isinstance(data, list) else []
    return [{
        "source": "odds_api",
        "endpoint": endpoint,
        "payload": it
    } for it in items]

# ---------------------------------------------------------------
# 8️⃣ CricketData fetcher
# ---------------------------------------------------------------
def fetch_cricketdata(endpoint: str) -> List[Dict]:
    url = f"https://cricketdata.org{endpoint}"
    data = safe_get(url, headers={"x-api-key": CRICKET_KEY})
    items = data if isinstance(data, list) else [data] if data else []
    return [{
        "source": "cricketdata",
        "endpoint": endpoint,
        "payload": it
    } for it in items]

# ---------------------------------------------------------------
# 9️⃣ Insert rows into Supabase (v2 SDK uses .error / .data)
# ---------------------------------------------------------------
def upsert_to_supabase(rows: List[Dict], table_name: str) -> None:
    if not rows:
        print("⚠️ No rows to write – skipping.")
        return
    resp = supabase.table(table_name).insert(rows).execute()
    # resp is an APIResponse object
    if resp.error:
        print(f"❌ Supabase error: {resp.error}")
    else:
        inserted = resp.data
        print(f"✅ Inserted {len(inserted)} rows into `{table_name}`")

# ---------------------------------------------------------------
# 10️⃣ Main driver – orchestrates everything
# ---------------------------------------------------------------
def main() -> None:
    # Choose the table you created in Supabase.
    # If you used the “generic” option from the guide, it is `api_raw`.
    TABLE_NAME = "api_raw"

    # ---------- API‑Sports ----------
    for sport, base in API_SPORTS_SPORTS.items():
        for ep in API_SPORTS_ENDPOINTS:
            print(f"🔎 API‑Sports → {sport}/{ep}")
            rows = fetch_apisports(sport, base, ep)
            upsert_to_supabase(rows, TABLE_NAME)

    # ---------- RapidAPI (optional) ----------
    if RAPIDAPI_KEY:
        # 👉←‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑-
        # Replace these two lines with the real RapidAPI service you want.
        RAPIDAPI_HOST = "example-rapidapi-host.p.rapidapi.com"   # ←‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑----‑
        RAPIDAPI_ENDPOINTS = ["/some/endpoint"]                # ←‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑‑-
        for ep in RAPIDAPI_ENDPOINTS:
            print(f"🔎 RapidAPI → {RAPIDAPI_HOST}{ep}")
            rows = fetch_rapidapi(RAPIDAPI_HOST, ep)
            upsert_to_supabase(rows, TABLE_NAME)

    # ---------- Odds‑API ----------
    if ODDS_API_KEY:
        ODDS_ENDPOINT = "v4/sports"   # change to any odds‑api endpoint you need
        print(f"🔎 Odds‑API → {ODDS_ENDPOINT}")
        rows = fetch_oddsapi(ODDS_ENDPOINT)
        upsert_to_supabase(rows, TABLE_NAME)

    # ---------- CricketData ----------
    if CRICKET_KEY:
        CRICKET_ENDPOINTS = ["/matches", "/teams"]   # adjust as needed
        for ep in CRICKET_ENDPOINTS:
            print(f"🔎 CricketData → {ep}")
            rows = fetch_cricketdata(ep)
            upsert_to_supabase(rows, TABLE_NAME)

    print("✅ All sources processed – you are done!")

# ---------------------------------------------------------------
if __name__ == "__main__":
    main()
