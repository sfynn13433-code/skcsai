"""Check predictions_final table schema and fix risk_level constraint"""
import os
from dotenv import load_dotenv
from pathlib import Path
from supabase import create_client

# Load environment
env_path = Path(__file__).parent / 'backend' / 'scripts' / '.env'
load_dotenv(env_path)

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

print("🔍 Checking predictions_final risk_level constraint")
print("=" * 70)

# Try inserting with different risk_level values to find what works
test_values = ['low', 'medium', 'high', 'safe', 'risky', 'normal', 'aggressive', 'conservative']

working_values = []

for val in test_values:
    try:
        test_pred = {
            'tier': 'normal',
            'type': 'single',
            'total_confidence': 75.0,
            'risk_level': val,
            'matches': [{'sport': 'test', 'home_team': 'A', 'away_team': 'B'}],
            'created_at': '2026-01-01T00:00:00'
        }
        result = supabase.table('predictions_final').insert(test_pred).execute()
        # Delete the test record
        supabase.table('predictions_final').delete().eq('risk_level', val).eq('tier', 'normal').execute()
        working_values.append(val)
        print(f"  ✅ '{val}' - WORKS")
    except Exception as e:
        print(f"  ❌ '{val}' - FAILS: {str(e)[:60]}")

print(f"\n✅ Working risk_level values: {working_values}")

# Count current predictions by sport
print("\n📊 Current predictions by sport:")
try:
    res = supabase.table('predictions_final').select('matches').execute()
    rows = res.data or []
    
    sport_counts = {}
    for row in rows:
        matches = row.get('matches', [])
        for match in matches:
            sport = match.get('sport', 'unknown')
            sport_counts[sport] = sport_counts.get(sport, 0) + 1
    
    for sport, count in sorted(sport_counts.items()):
        print(f"  {sport:35} {count:>3} predictions")
    
    print(f"\n  TOTAL: {len(rows)} predictions across {len(sport_counts)} sports")
except Exception as e:
    print(f"❌ Error: {e}")
