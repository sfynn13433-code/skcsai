import os
import requests
from dotenv import load_dotenv
from supabase import create_client

# 1. Load Environment
load_dotenv()

url = os.getenv("SUPABASE_URL")
# CRITICAL: We MUST use the Service Role Key to bypass security blocks
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")

if not url or not key:
    print("❌ ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")
    exit()

supabase = create_client(url, key)

def test_ingestion():
    print("🚀 Starting Force-Sync...")
    
    # --- TEST 1: Insert a Sport ---
    print("\n--- Testing 'sports' table ---")
    sport_data = {
        "sport_key": "soccer_epl",
        "sport_group": "Soccer",
        "title": "Premier League",
        "description": "English Premier League",
        "active": True
    }
    
    try:
        # Use upsert to handle existing records
        res = supabase.table("sports").upsert(sport_data).execute()
        print(f"✅ Supabase Response (Sports): {res.data}")
    except Exception as e:
        print(f"❌ Supabase Error (Sports): {e}")

    # --- TEST 2: Pull Sporting Odds (The Odds API) ---
    odds_key = os.getenv("ODDS_API_KEY")
    if odds_key:
        print("\n--- Testing Sporting Odds API ---")
        odds_url = f"https://api.the-odds-api.com/v4/sports/soccer_epl/odds/?apiKey={odds_key}&regions=us&markets=h2h"
        response = requests.get(odds_url)
        
        if response.status_code == 200:
            data = response.json()
            if data:
                first_game = data[0]
                event_data = {
                    "id": first_game["id"],
                    "sport_key": "soccer_epl",
                    "commence_time": first_game["commence_time"],
                    "home_team": first_game["home_team"],
                    "away_team": first_game["away_team"]
                }
                try:
                    ev_res = supabase.table("events").upsert(event_data).execute()
                    print(f"✅ Supabase Response (Events): {ev_res.data}")
                except Exception as e:
                    print(f"❌ Supabase Error (Events): {e}")
        else:
            print(f"❌ Odds API Failed: {response.status_code}")

if __name__ == "__main__":
    test_ingestion()
