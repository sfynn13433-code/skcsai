"""Check detailed predictions data to see why webpage is empty"""
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

print("🔍 Analyzing predictions_final table data")
print("=" * 70)

try:
    res = supabase.table('predictions_final').select('*').execute()
    predictions = res.data
    
    print(f"Total predictions: {len(predictions)}\n")
    
    for i, pred in enumerate(predictions, 1):
        print(f"Prediction #{i}:")
        print(f"  ID: {pred.get('id')}")
        print(f"  Tier: {pred.get('tier')}")
        print(f"  Type: {pred.get('type')}")
        print(f"  Confidence: {pred.get('total_confidence')}")
        print(f"  Created: {pred.get('created_at')}")
        
        matches = pred.get('matches', [])
        print(f"  Matches ({len(matches)}):")
        
        for match in matches:
            print(f"    - Sport: {match.get('sport')}")
            print(f"      Teams: {match.get('home_team')} vs {match.get('away_team')}")
            print(f"      Prediction: {match.get('prediction')}")
        print()
    
    # Check what sports are in the predictions
    sports_in_predictions = set()
    for pred in predictions:
        for match in pred.get('matches', []):
            sport = match.get('sport', '').lower()
            if sport:
                sports_in_predictions.add(sport)
    
    print("=" * 70)
    print(f"Sports in predictions: {list(sports_in_predictions)}")
    print("\nFrontend sport filter mapping:")
    print("  football -> ['football', 'soccer_epl', 'soccer_england_efl_cup', ...]")
    print("  basketball -> ['basketball', 'nba', 'basketball_nba', ...]")
    print("  baseball -> ['baseball', 'baseball_mlb']")
    print("  hockey -> ['hockey', 'icehockey_nhl']")
    
    print("\n❓ DIAGNOSIS:")
    if not predictions:
        print("  ❌ No predictions in table")
    elif not sports_in_predictions:
        print("  ❌ Predictions have no sport field")
    else:
        print(f"  ✅ Predictions exist for sports: {list(sports_in_predictions)}")
        print("  ℹ️  Frontend might be filtering by wrong sport key")
        
except Exception as e:
    print(f"❌ Error: {e}")
