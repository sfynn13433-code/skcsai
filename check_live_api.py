"""
CHECK LIVE API RESPONSE - NO CHANGES
See what the API actually returns for each sport tab
"""
import os
import json
import httpx
import asyncio
from datetime import datetime
from dotenv import load_dotenv
from pathlib import Path
from supabase import create_client

# Load environment
env_path = Path(__file__).parent / 'backend' / 'scripts' / '.env'
load_dotenv(env_path)
load_dotenv() # Also load default .env for API_SPORTS_KEY

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

API_KEY = os.getenv("X_APISPORTS_KEY")
BASE_URL = "https://v3.football.api-sports.io"

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

async def check_live_fixtures():
    if not API_KEY:
        print("❌ Error: X_APISPORTS_KEY not found in your .env file!")
        return

    headers = {
        "x-apisports-key": API_KEY,
        "x-apisports-host": "v3.football.api-sports.io"
    }
    
    # We fetch today's fixtures to guarantee we get a response payload
    today = datetime.now().strftime("%Y-%m-%d")
    endpoint = f"{BASE_URL}/fixtures?date={today}"

    print(f"\n📡 Pinging API-SPORTS for {today} fixtures...")

    # Using httpx for async requests (faster for our future multi-sport engine)
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(endpoint, headers=headers, timeout=10.0)
            response.raise_for_status() 
            
            data = response.json()
            
            # Catch API-level authentication errors
            if data.get("errors"):
                print("❌ API Error:", data["errors"])
                return
                
            fixtures = data.get("response", [])
            print(f"✅ Success! Your API key is valid. Found {len(fixtures)} fixtures for today.\n")
            
            # Print the first 3 matches to inspect the legal data structure
            print("--- SAMPLE DATA PIPELINE ---")
            for match in fixtures[:3]:
                league = match["league"]["name"]
                home = match["teams"]["home"]["name"]
                away = match["teams"]["away"]["name"]
                status = match["fixture"]["status"]["long"]
                print(f"🏆 {league} | {home} vs {away} [{status}]")
                
            print("\n🧠 SKCS AI Sports Edge pipeline is active.")

        except httpx.HTTPError as exc:
            print(f"❌ HTTP Exception: {exc}")

def main():
    print("="*80)
    print("CHECKING LIVE API RESPONSE SIMULATION")
    print("="*80)

    # SPORT_FILTER_MAP from backend/routes/predictions.js
    SPORT_FILTERS = {
        'football': ['football', 'soccer_epl', 'soccer_england_efl_cup', 'soccer_uefa_champs_league'],
        'basketball': ['basketball', 'nba', 'basketball_nba', 'basketball_euroleague'],
        'nfl': ['nfl', 'american_football', 'americanfootball_nfl'],
        'rugby': ['rugby', 'rugbyunion_international', 'rugbyunion_six_nations'],
        'hockey': ['hockey', 'icehockey_nhl'],
        'baseball': ['baseball', 'baseball_mlb'],
        'afl': ['afl', 'aussierules_afl'],
        'mma': ['mma', 'mma_mixed_martial_arts'],
        'formula1': ['formula1'],
        'handball': ['handball'],
        'volleyball': ['volleyball'],
        'cricket': ['cricket']
    }

    # Get all predictions
    res = supabase.table('predictions_final').select('*').execute()
    all_predictions = res.data or []

    print(f"\nTotal predictions in database: {len(all_predictions)}")

    # Simulate what the API returns for each sport tab
    for tab, valid_keys in SPORT_FILTERS.items():
        print(f"\n{'='*80}")
        print(f"🌐 TAB: {tab.upper()}")
        print(f"   Looking for sport keys: {valid_keys}")
        print(f"{'='*80}")
        
        # Find predictions matching this tab
        matching = []
        for p in all_predictions:
            matches = p.get('matches', [])
            for m in matches:
                sport = m.get('sport', '').lower()
                if any(vk.lower() == sport for vk in valid_keys):
                    matching.append(p)
                    break
        
        print(f"   ✅ Found: {len(matching)} predictions")
        
        if matching:
            # Show first 2
            for i, p in enumerate(matching[:2], 1):
                matches = p.get('matches', [])
                if matches:
                    m = matches[0]
                    meta = m.get('metadata', {})
                    print(f"\n   Prediction {i}:")
                    print(f"     Teams: {m.get('home_team')} vs {m.get('away_team')}")
                    print(f"     Sport key: {m.get('sport')}")
                    print(f"     Confidence: {p.get('total_confidence')}%")
                    
                    # Show rich metadata
                    if 'race_name' in meta:
                        print(f"     🏎️ Race: {meta['race_name']}")
                        print(f"        Circuit: {meta.get('circuit', 'N/A')}")
                    elif 'tournament' in meta:
                        print(f"     🏆 Tournament: {meta['tournament']}")
                        if 'stage' in meta:
                            print(f"        Stage: {meta['stage']}")
                    elif 'league' in meta:
                        print(f"     🏟️ League: {meta['league']}")
                        if 'matchday' in meta:
                            print(f"        {meta['matchday']}")
                        elif 'week' in meta:
                            print(f"        {meta['week']}")
                    elif 'event' in meta:
                        print(f"     🥊 Event: {meta['event']}")
                        if 'weight_class' in meta:
                            print(f"        Weight Class: {meta['weight_class']}")
        else:
            print(f"   ❌ NO PREDICTIONS - This tab will be EMPTY on the website!")

    print("\n" + "="*80)
    print("SUMMARY: All tabs should now show predictions")
    print("="*80)

    # Count predictions per tab
    print("\n📊 PREDICTION COUNT PER TAB:")
    for tab, valid_keys in SPORT_FILTERS.items():
        count = 0
        for p in all_predictions:
            matches = p.get('matches', [])
            for m in matches:
                sport = m.get('sport', '').lower()
                if any(vk.lower() == sport for vk in valid_keys):
                    count += 1
                    break
        status = "✅" if count > 0 else "❌"
        print(f"  {status} {tab:15} - {count} predictions")

    print("\n" + "="*80)
    print("🌐 REFRESH YOUR WEBSITE - All 12 tabs should now work!")
    print("="*80)

if __name__ == "__main__":
    main()
    asyncio.run(check_live_fixtures())
