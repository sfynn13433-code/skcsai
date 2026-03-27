"""
Verify the predictions API returns metadata to the frontend
Check what the API actually outputs vs what's in Supabase
"""
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

print("="*80)
print("VERIFYING API RESPONSE FORMAT - CHECK IF METADATA IS INCLUDED")
print("="*80)

# Get sample predictions for each sport
sports_to_check = ['formula1', 'volleyball', 'handball', 'mma', 'icehockey_nhl', 
                   'basketball_nba', 'soccer_epl']

for sport in sports_to_check:
    print(f"\n{'='*80}")
    print(f"SPORT: {sport}")
    print(f"{'='*80}")
    
    res = supabase.table('predictions_final').select('*').execute()
    predictions = res.data or []
    
    # Find predictions for this sport
    for p in predictions:
        matches = p.get('matches', [])
        for m in matches:
            if m.get('sport') == sport:
                print(f"\nPrediction ID: {p.get('id')}")
                print(f"Tier: {p.get('tier')}")
                print(f"Type: {p.get('type')}")
                print(f"Confidence: {p.get('total_confidence')}%")
                print(f"Risk Level: {p.get('risk_level')}")
                
                print(f"\nMatch:")
                print(f"  Sport: {m.get('sport')}")
                print(f"  Home: {m.get('home_team')}")
                print(f"  Away: {m.get('away_team')}")
                print(f"  Prediction: {m.get('prediction')}")
                print(f"  Confidence: {m.get('confidence')}%")
                
                # Check metadata
                meta = m.get('metadata', {})
                print(f"\n  Metadata: {json.dumps(meta, indent=4)}")
                
                # This is what the API returns
                print(f"\n📦 API RESPONSE STRUCTURE:")
                print(f"  matches array contains: sport, home_team, away_team, prediction, confidence, metadata")
                print(f"  metadata contains: {list(meta.keys())}")
                
                break
        else:
            continue
        break

print("\n" + "="*80)
print("ANALYSIS:")
print("="*80)
print("""
If metadata WITH rich details (race_name, tournament, league, etc.) is shown above,
then Supabase has the data. 

The API returns the full prediction object including metadata.

If the website doesn't show this info, check:
1. Is the frontend reading the metadata object from the API response?
2. Is it displaying the metadata fields (race_name, tournament, etc.)?
3. Look at public/index.html line ~860 where it extracts team names
   - It should also extract metadata fields

The backend API is correct. The data is in Supabase.
The issue is the frontend not DISPLAYING the metadata.
""")
