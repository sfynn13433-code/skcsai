"""Check current predictions and verify what data is actually stored"""
import os
import json
from dotenv import load_dotenv
from pathlib import Path
from supabase import create_client

# Load environment
env_path = Path(__file__).parent / 'backend' / 'scripts' / '.env'
load_dotenv(env_path)

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

print("🔍 CHECKING ACTUAL PREDICTIONS IN DATABASE")
print("=" * 70)

# Get all predictions
res = supabase.table('predictions_final').select('*').execute()
predictions = res.data or []

print(f"Total predictions: {len(predictions)}\n")

# Group by sport
by_sport = {}
for p in predictions:
    matches = p.get('matches', [])
    for m in matches:
        sport = m.get('sport', 'unknown')
        if sport not in by_sport:
            by_sport[sport] = []
        by_sport[sport].append({
            'home': m.get('home_team'),
            'away': m.get('away_team'),
            'prediction': m.get('prediction'),
            'confidence': m.get('confidence'),
            'metadata': m.get('metadata', {})
        })

print("Predictions by sport:")
print("-" * 70)

for sport, matches in sorted(by_sport.items()):
    print(f"\n{sport}: {len(matches)} predictions")
    for i, m in enumerate(matches[:3], 1):  # Show first 3
        print(f"  {i}. {m['home']} vs {m['away']}")
        print(f"     Prediction: {m['prediction']}, Confidence: {m['confidence']}%")
        print(f"     Metadata: {json.dumps(m['metadata'])[:100]}...")

print("\n" + "=" * 70)
print(f"TOTAL: {len(predictions)} predictions across {len(by_sport)} sports")
print("=" * 70)

# Check events table too
print("\n📊 EVENTS TABLE:")
events_res = supabase.table('events').select('*').execute()
events = events_res.data or []
print(f"Total events: {len(events)}")

events_by_sport = {}
for e in events:
    sport = e.get('sport_key', 'unknown')
    events_by_sport[sport] = events_by_sport.get(sport, 0) + 1

for sport, count in sorted(events_by_sport.items()):
    print(f"  {sport}: {count} events")
