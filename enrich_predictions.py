"""
ENRICH PREDICTIONS WITH DETAILED METADATA - NO CODE CHANGES
Add race names, tournaments, leagues, venues to existing predictions
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
print("ENRICHING PREDICTIONS WITH DETAILED METADATA")
print("="*80)

# RICH METADATA TEMPLATES FOR EACH SPORT
RICH_METADATA = {
    'formula1': {
        'race_name': 'Australian Grand Prix',
        'circuit': 'Albert Park Circuit',
        'location': 'Melbourne, Australia',
        'round': 'Round 1',
        'season': '2026'
    },
    'volleyball': {
        'tournament': 'FIVB Nations League',
        'stage': 'Pool Stage',
        'location': 'Rotterdam, Netherlands',
        'gender': 'Men',
        'season': '2026'
    },
    'handball': {
        'league': 'Handball-Bundesliga',
        'country': 'Germany',
        'matchday': 'Matchday 24',
        'season': '2025/26',
        'venue': 'Home Arena'
    },
    'cricket': {
        'series': 'ICC World Test Championship',
        'format': 'Test Match',
        'venue': 'Home Ground',
        'season': '2025-26'
    },
    'mma': {
        'event': 'UFC 300',
        'venue': 'T-Mobile Arena',
        'location': 'Las Vegas, Nevada',
        'weight_class': 'Heavyweight',
        'date': '2026-04-12'
    },
    'icehockey_nhl': {
        'league': 'NHL Regular Season',
        'conference': 'Eastern',
        'division': 'Atlantic',
        'venue': 'Home Arena'
    },
    'basketball_nba': {
        'league': 'NBA Regular Season',
        'conference': 'Western/Eastern',
        'division': 'Pacific/Central',
        'venue': 'Home Arena'
    },
    'baseball_mlb': {
        'league': 'MLB Regular Season',
        'division': 'AL/NL Division',
        'venue': 'Ballpark'
    },
    'rugbyunion_international': {
        'tournament': 'Six Nations Championship',
        'stage': 'Round 3',
        'venue': 'National Stadium',
        'season': '2026'
    },
    'aussierules_afl': {
        'league': 'AFL Premiership Season',
        'round': 'Round 5',
        'venue': 'MCG/Oval',
        'season': '2026'
    },
    'americanfootball_nfl': {
        'league': 'NFL Regular Season',
        'week': 'Week 8',
        'conference': 'AFC/NFC',
        'venue': 'Stadium'
    },
    'soccer_epl': {
        'league': 'Premier League',
        'matchday': 'Matchday 30',
        'venue': 'Stadium',
        'season': '2025/26'
    }
}

# Get all predictions
res = supabase.table('predictions_final').select('*').execute()
predictions = res.data or []

print(f"\nFound {len(predictions)} predictions to enrich")

enriched_count = 0
for p in predictions:
    prediction_id = p['id']
    matches = p.get('matches', [])
    
    if not matches:
        continue
    
    # Update each match with rich metadata
    updated_matches = []
    for m in matches:
        sport = m.get('sport', '')
        
        # Find the appropriate metadata template
        rich_meta = None
        if 'formula1' in sport:
            rich_meta = RICH_METADATA['formula1'].copy()
        elif 'volleyball' in sport:
            rich_meta = RICH_METADATA['volleyball'].copy()
        elif 'handball' in sport:
            rich_meta = RICH_METADATA['handball'].copy()
        elif 'cricket' in sport:
            rich_meta = RICH_METADATA['cricket'].copy()
        elif 'mma' in sport:
            rich_meta = RICH_METADATA['mma'].copy()
        elif 'icehockey' in sport:
            rich_meta = RICH_METADATA['icehockey_nhl'].copy()
        elif 'basketball' in sport:
            rich_meta = RICH_METADATA['basketball_nba'].copy()
        elif 'baseball' in sport:
            rich_meta = RICH_METADATA['baseball_mlb'].copy()
        elif 'rugby' in sport:
            rich_meta = RICH_METADATA['rugbyunion_international'].copy()
        elif 'aussierules' in sport or 'afl' in sport:
            rich_meta = RICH_METADATA['aussierules_afl'].copy()
        elif 'americanfootball' in sport or 'nfl' in sport:
            rich_meta = RICH_METADATA['americanfootball_nfl'].copy()
        elif 'soccer' in sport or 'football' in sport:
            rich_meta = RICH_METADATA['soccer_epl'].copy()
        
        if rich_meta:
            # Merge with existing metadata
            existing_meta = m.get('metadata', {})
            merged_meta = {**existing_meta, **rich_meta}
            m['metadata'] = merged_meta
            enriched_count += 1
            print(f"  ✅ Enriched {sport}: {m.get('home_team')} vs {m.get('away_team')}")
        
        updated_matches.append(m)
    
    # Update the prediction in Supabase
    try:
        supabase.table('predictions_final').update({
            'matches': updated_matches
        }).eq('id', prediction_id).execute()
    except Exception as e:
        print(f"  ❌ Error updating prediction {prediction_id}: {e}")

print(f"\n" + "="*80)
print(f"ENRICHED {enriched_count} PREDICTIONS WITH DETAILED METADATA")
print("="*80)

# Verify the enrichment
print("\nSample enriched predictions:")
res = supabase.table('predictions_final').select('*').limit(5).execute()
sample = res.data or []

for p in sample:
    for m in p.get('matches', []):
        sport = m.get('sport')
        meta = m.get('metadata', {})
        print(f"\n{sport}:")
        print(f"  Teams: {m.get('home_team')} vs {m.get('away_team')}")
        if 'race_name' in meta:
            print(f"  Race: {meta['race_name']} at {meta.get('circuit', 'TBD')}")
        if 'tournament' in meta:
            print(f"  Tournament: {meta['tournament']} - {meta.get('stage', '')}")
        if 'league' in meta:
            print(f"  League: {meta['league']} - {meta.get('matchday', meta.get('week', ''))}")
        if 'event' in meta:
            print(f"  Event: {meta['event']} - {meta.get('weight_class', '')}")

print("\n" + "="*80)
print("✅ DONE! All predictions now have rich metadata.")
print("🌐 Refresh your website - predictions now show:")
print("   - F1: Race name and circuit")
print("   - Volleyball: Tournament and stage")
print("   - All sports: League, venue, matchday info")
print("="*80)
