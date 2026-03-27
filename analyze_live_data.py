"""
ANALYZE LIVE SUPABASE DATA - NO CODE CHANGES
Find where all sports data is and map it to what the website needs
"""
import os
import json
from datetime import datetime
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
print("LIVE SUPABASE DATA ANALYSIS - NO CHANGES BEING MADE")
print("="*80)

# 1. CHECK ALL TABLES THAT EXIST
print("\n📊 STEP 1: LISTING ALL TABLES WITH DATA")
print("-"*80)

tables_to_check = [
    'predictions_final',
    'sports', 
    'events',
    'teams',
    'leagues',
    'players',
    'bookmakers',
    'odds_snapshots'
]

table_counts = {}
for table in tables_to_check:
    try:
        res = supabase.table(table).select('*', count='exact').limit(1).execute()
        count = res.count or 0
        table_counts[table] = count
        print(f"  ✅ {table:25} {count:>5} rows")
    except Exception as e:
        print(f"  ❌ {table:25} ERROR: {str(e)[:50]}")

# 2. DETAILED CHECK OF predictions_final
print("\n📊 STEP 2: ANALYZE predictions_final TABLE")
print("-"*80)

try:
    # Get sample of predictions
    res = supabase.table('predictions_final').select('*').limit(20).execute()
    predictions = res.data or []
    
    print(f"Total predictions: {len(predictions)}")
    
    # Analyze by sport
    sports_in_predictions = {}
    for p in predictions:
        matches = p.get('matches', [])
        for m in matches:
            sport = m.get('sport', 'unknown')
            if sport not in sports_in_predictions:
                sports_in_predictions[sport] = []
            sports_in_predictions[sport].append({
                'home': m.get('home_team'),
                'away': m.get('away_team'),
                'prediction': m.get('prediction'),
                'confidence': m.get('confidence'),
                'has_metadata': bool(m.get('metadata')),
                'full_match': m
            })
    
    print(f"\nSports found in predictions_final:")
    for sport, matches in sorted(sports_in_predictions.items()):
        print(f"\n  {sport}: {len(matches)} predictions")
        for i, m in enumerate(matches[:2], 1):
            print(f"    {i}. {m['home']} vs {m['away']}")
            if m['has_metadata']:
                meta = m['full_match'].get('metadata', {})
                # Check for rich details
                details = []
                if 'league' in meta:
                    details.append(f"League: {meta['league']}")
                if 'tournament' in meta:
                    details.append(f"Tournament: {meta['tournament']}")
                if 'race_name' in meta:
                    details.append(f"Race: {meta['race_name']}")
                if 'circuit' in meta:
                    details.append(f"Circuit: {meta['circuit']}")
                if details:
                    print(f"       Details: {', '.join(details)}")
                else:
                    print(f"       Metadata: {list(meta.keys())}")
    
except Exception as e:
    print(f"❌ Error analyzing predictions_final: {e}")

# 3. CHECK sports TABLE
print("\n📊 STEP 3: ANALYZE sports TABLE")
print("-"*80)

try:
    res = supabase.table('sports').select('*').execute()
    sports = res.data or []
    
    print(f"Total sports: {len(sports)}")
    print("\nSports by group:")
    
    by_group = {}
    for s in sports:
        group = s.get('sport_group', 'unknown')
        if group not in by_group:
            by_group[group] = []
        by_group[group].append(s.get('sport_key'))
    
    for group, keys in sorted(by_group.items()):
        print(f"  {group}: {len(keys)} sports")
        for k in keys[:5]:
            print(f"    - {k}")
        if len(keys) > 5:
            print(f"    ... and {len(keys)-5} more")
            
except Exception as e:
    print(f"❌ Error: {e}")

# 4. CHECK events TABLE FOR RICH DATA
print("\n📊 STEP 4: ANALYZE events TABLE FOR RICH DETAILS")
print("-"*80)

try:
    res = supabase.table('events').select('*').execute()
    events = res.data or []
    
    print(f"Total events: {len(events)}")
    
    # Group by sport
    by_sport = {}
    for e in events:
        sport = e.get('sport_key', 'unknown')
        if sport not in by_sport:
            by_sport[sport] = []
        by_sport[sport].append(e)
    
    print(f"\nEvents by sport:")
    for sport, evts in sorted(by_sport.items()):
        print(f"\n  {sport}: {len(evts)} events")
        
        # Check first event for rich data
        if evts:
            first = evts[0]
            print(f"    Sample event keys: {list(first.keys())}")
            
            # Look for rich details
            rich_fields = {}
            if 'league' in first and first['league']:
                rich_fields['league'] = first['league']
            if 'tournament' in first and first['tournament']:
                rich_fields['tournament'] = first['tournament']
            if 'venue' in first and first['venue']:
                rich_fields['venue'] = first['venue']
            if 'race_name' in first and first['race_name']:
                rich_fields['race_name'] = first['race_name']
            if 'circuit' in first and first['circuit']:
                rich_fields['circuit'] = first['circuit']
            if 'round' in first and first['round']:
                rich_fields['round'] = first['round']
            if 'season' in first and first['season']:
                rich_fields['season'] = first['season']
            
            if rich_fields:
                print(f"    Rich data found: {json.dumps(rich_fields, indent=2)[:200]}")
            else:
                print(f"    Basic data only: home={first.get('home_team')}, away={first.get('away_team')}")
    
except Exception as e:
    print(f"❌ Error: {e}")

# 5. SUMMARY - WHAT'S MISSING
print("\n" + "="*80)
print("📋 ANALYSIS SUMMARY - WHAT THE WEBSITE NEEDS")
print("="*80)

print("""
Website tabs and what they need:
  ⚽ football    → Need: League info (EPL, La Liga, etc.), Match details
  🏉 rugby       → Need: Tournament info (Six Nations, World Cup, etc.)
  🏐 afl         → Need: League/AFL season info
  ⚾ baseball    → Need: MLB game details, stadium
  🏀 basketball  → Need: NBA game details, arena
  🏎️ formula1    → Need: Race name, Circuit, Grand Prix info ⚠️ CRITICAL
  🏏 cricket     → Need: Series info, Test/ODI/T20 format
  🏈 nfl         → Need: Week/round info, stadium
  🏒 hockey      → Need: NHL game details
  🤼 mma         → Need: Event name (UFC 300, etc.), weight class
  🤾 handball    → Need: League info, venue
  🏐 volleyball  → Need: Tournament info, Nations League/Olympics/etc. ⚠️ CRITICAL

""")

# 6. CHECK FOR DATA GAPS
print("\n📊 STEP 6: IDENTIFYING DATA GAPS")
print("-"*80)

# Map website tabs to sports in predictions
tab_to_sport_map = {
    'football': ['soccer_epl', 'football'],
    'rugby': ['rugbyunion_international', 'rugby'],
    'afl': ['aussierules_afl', 'afl'],
    'baseball': ['baseball_mlb', 'baseball'],
    'basketball': ['basketball_nba', 'basketball'],
    'formula1': ['formula1'],
    'cricket': ['cricket_international', 'cricket'],
    'nfl': ['americanfootball_nfl', 'nfl'],
    'hockey': ['icehockey_nhl', 'hockey'],
    'mma': ['mma_mixed_martial_arts', 'mma'],
    'handball': ['handball_germany_bundesliga', 'handball'],
    'volleyball': ['volleyball'],
}

print("Checking each website tab:")
for tab, sport_keys in tab_to_sport_map.items():
    # Check if any predictions exist for this tab
    found = False
    count = 0
    for sport_key in sport_keys:
        if sport_key in sports_in_predictions:
            found = True
            count += len(sports_in_predictions[sport_key])
    
    status = "✅" if found else "❌"
    print(f"  {status} {tab:15} ({count} predictions)")

print("\n" + "="*80)
print("NEXT: Need to check if events table has richer data that can be")
print("      added to predictions to show race names, tournaments, etc.")
print("="*80)
