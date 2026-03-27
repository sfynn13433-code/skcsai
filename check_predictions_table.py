"""Check if predictions_final table exists and what's in it"""
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

print("🔍 Checking predictions_final table")
print("=" * 70)

try:
    res = supabase.table('predictions_final').select('*').limit(5).execute()
    predictions = res.data
    
    print(f"✅ Table exists with {len(predictions)} rows")
    
    if predictions:
        print("\nSample predictions:")
        for pred in predictions:
            print(f"\n  ID: {pred.get('id')}")
            print(f"  Tier: {pred.get('tier')}")
            print(f"  Type: {pred.get('type')}")
            print(f"  Confidence: {pred.get('total_confidence')}")
            print(f"  Matches: {len(pred.get('matches', []))}")
    else:
        print("\n❌ Table is EMPTY - this is why the webpage shows nothing!")
        print("\nThe webpage needs data in 'predictions_final' table")
        print("We have data in: sports, events, bookmakers, odds_snapshots")
        print("\nNeed to generate predictions from events and insert into predictions_final")
        
except Exception as e:
    print(f"❌ Error: {e}")
    print("\nTable might not exist or has schema issues")
