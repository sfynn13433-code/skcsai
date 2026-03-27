"""
Populate sports data using The Odds API (which is working!)
This bypasses the rate-limited API-Football
"""
import os
import requests
from datetime import datetime
from dotenv import load_dotenv
from pathlib import Path
from supabase import create_client

# Load environment
env_path = Path(__file__).parent / 'backend' / 'scripts' / '.env'
load_dotenv(env_path)

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
ODDS_API_KEY = os.getenv('ODDS_API_KEY')

if not all([SUPABASE_URL, SUPABASE_KEY, ODDS_API_KEY]):
    print("❌ Missing required environment variables")
    exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def fetch_odds_api_sports():
    """Fetch available sports from The Odds API"""
    url = f"https://api.the-odds-api.com/v4/sports/?apiKey={ODDS_API_KEY}"
    
    print("📡 Fetching sports from The Odds API...")
    response = requests.get(url, timeout=10)
    
    if response.status_code == 200:
        sports = response.json()
        print(f"✅ Found {len(sports)} sports")
        return sports
    else:
        print(f"❌ API Error: {response.status_code}")
        return []

def upsert_sport(sport_data):
    """Insert or update a sport in Supabase"""
    payload = {
        'sport_key': sport_data['key'],
        'sport_group': sport_data.get('group', 'general'),
        'title': sport_data['title'],
        'description': sport_data.get('description', f"{sport_data['title']} from Odds API"),
        'active': sport_data.get('active', True),
        'has_outrights': sport_data.get('has_outrights', False),
        'updated_at': datetime.now().isoformat()
    }
    
    try:
        result = supabase.table('sports').upsert(payload).execute()
        print(f"  ✅ Upserted sport: {payload['sport_key']} - {payload['title']}")
        return result.data
    except Exception as e:
        print(f"  ❌ Error upserting sport {payload['sport_key']}: {e}")
        return None

def fetch_and_upsert_events(sport_key):
    """Fetch events (games) for a sport and upsert them"""
    url = f"https://api.the-odds-api.com/v4/sports/{sport_key}/odds/"
    params = {
        'apiKey': ODDS_API_KEY,
        'regions': 'us,uk,eu',
        'markets': 'h2h',
        'oddsFormat': 'decimal'
    }
    
    print(f"  📡 Fetching events for {sport_key}...")
    response = requests.get(url, params=params, timeout=10)
    
    if response.status_code == 200:
        events = response.json()
        print(f"  ✅ Found {len(events)} events")
        
        for event in events[:5]:  # Limit to 5 events per sport to save API calls
            event_payload = {
                'id': event['id'],
                'sport_key': sport_key,
                'commence_time': event['commence_time'],
                'home_team': event['home_team'],
                'away_team': event['away_team']
            }
            
            try:
                result = supabase.table('events').upsert(event_payload).execute()
                print(f"    ✅ Event: {event['home_team']} vs {event['away_team']}")
                
                # Upsert bookmakers and odds
                for bookmaker in event.get('bookmakers', [])[:3]:  # Limit bookmakers
                    bookmaker_payload = {
                        'bookmaker_key': bookmaker['key'],
                        'title': bookmaker['title']
                    }
                    
                    try:
                        supabase.table('bookmakers').upsert(bookmaker_payload).execute()
                        
                        # Upsert odds snapshots
                        for market in bookmaker.get('markets', []):
                            odds_payload = {
                                'event_id': event['id'],
                                'bookmaker_key': bookmaker['key'],
                                'market_key': market['key'],
                                'last_update': bookmaker.get('last_update', datetime.now().isoformat()),
                                'outcomes': market.get('outcomes', [])
                            }
                            
                            supabase.table('odds_snapshots').insert(odds_payload).execute()
                            
                    except Exception as e:
                        print(f"      ⚠️ Odds error: {e}")
                        
            except Exception as e:
                print(f"    ❌ Event error: {e}")
        
        return len(events)
    else:
        print(f"  ❌ API Error: {response.status_code}")
        return 0

def main():
    print("🚀 Starting Odds API Data Ingestion")
    print("=" * 70)
    
    # Fetch and upsert sports
    sports = fetch_odds_api_sports()
    
    if not sports:
        print("❌ No sports found")
        return
    
    print(f"\n📊 Upserting {len(sports)} sports to Supabase...")
    print("=" * 70)
    
    total_events = 0
    
    # Focus on popular sports to save API calls
    priority_sports = ['soccer_epl', 'basketball_nba', 'americanfootball_nfl', 
                       'icehockey_nhl', 'baseball_mlb']
    
    for sport in sports:
        sport_key = sport['key']
        
        # Upsert the sport
        upsert_sport(sport)
        
        # Only fetch events for priority sports to save API quota
        if sport_key in priority_sports:
            event_count = fetch_and_upsert_events(sport_key)
            total_events += event_count
    
    print("\n" + "=" * 70)
    print(f"✅ Ingestion Complete!")
    print(f"   Sports processed: {len(sports)}")
    print(f"   Events ingested: {total_events}")
    print("=" * 70)

if __name__ == "__main__":
    main()
