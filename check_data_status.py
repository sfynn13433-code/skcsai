import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

env_path = Path('backend/scripts/.env')
load_dotenv(env_path)

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

print('=== CHECKING INJURIES TABLE ===')
try:
    injuries = supabase.table('injuries').select('*').execute()
    print(f'Total injuries: {len(injuries.data or [])}')
    if injuries.data:
        print('Sample:', injuries.data[0])
except Exception as e:
    print(f'Error: {e}')

print('\n=== CHECKING NEWS_MENTIONS TABLE ===')
try:
    news = supabase.table('news_mentions').select('*').execute()
    print(f'Total news mentions: {len(news.data or [])}')
    if news.data:
        print('Sample:', news.data[0])
except Exception as e:
    print(f'Error: {e}')

print('\n=== CHECKING TIER_RULES TABLE ===')
try:
    tiers = supabase.table('tier_rules').select('*').execute()
    print(f'Total tier rules: {len(tiers.data or [])}')
    for tier in (tiers.data or []):
        tier_name = tier.get('tier')
        min_conf = tier.get('min_confidence')
        markets = tier.get('allowed_markets')
        print(f'  - {tier_name}: min_confidence={min_conf}, markets={markets}')
except Exception as e:
    print(f'Error: {e}')

print('\n=== CHECKING PREDICTIONS COVERAGE ===')
try:
    preds = supabase.table('predictions_final').select('*').execute()
    print(f'Total predictions: {len(preds.data or [])}')
    
    sports_count = {}
    for pred in (preds.data or []):
        matches = pred.get('matches', [])
        if matches:
            sport = matches[0].get('sport', 'unknown')
            sports_count[sport] = sports_count.get(sport, 0) + 1
    
    print('Predictions by sport:')
    for sport, count in sorted(sports_count.items()):
        print(f'  - {sport}: {count}')
except Exception as e:
    print(f'Error: {e}')
