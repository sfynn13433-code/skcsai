import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

env_path = Path('backend/scripts/.env')
load_dotenv(env_path)

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

print("=" * 80)
print("CHECKING ALL PREDICTIONS FOR ACCURACY")
print("=" * 80)

preds = supabase.table('predictions_final').select('*').execute()
all_preds = preds.data or []

# Group by sport
by_sport = {}
for pred in all_preds:
    matches = pred.get('matches', [])
    if matches:
        sport = matches[0].get('sport', 'unknown')
        if sport not in by_sport:
            by_sport[sport] = []
        by_sport[sport].append(pred)

# Display each sport's fixtures
for sport in sorted(by_sport.keys()):
    print(f"\n{'=' * 80}")
    print(f"SPORT: {sport.upper()}")
    print(f"{'=' * 80}")
    
    for pred in by_sport[sport][:3]:  # Show first 3
        matches = pred.get('matches', [])
        if matches:
            m = matches[0]
            home = m.get('home_team', 'Unknown')
            away = m.get('away_team', 'Unknown')
            time = m.get('commence_time', 'No time')
            meta = m.get('metadata', {})
            league = meta.get('league', 'Unknown')
            matchday = meta.get('matchday', '')
            
            print(f"\n  {home} vs {away}")
            print(f"    League: {league}")
            print(f"    Matchday: {matchday}")
            print(f"    Time: {time}")
            print(f"    Confidence: {pred.get('total_confidence', 0)}%")

print(f"\n{'=' * 80}")
print(f"TOTAL PREDICTIONS: {len(all_preds)}")
print(f"SPORTS COVERED: {len(by_sport)}")
print(f"{'=' * 80}")
