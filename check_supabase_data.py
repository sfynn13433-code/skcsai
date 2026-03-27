"""Check what data is actually in Supabase tables"""
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

print("🔍 Checking Supabase Database Contents")
print("=" * 70)

# Check sports table
print("\n📊 SPORTS TABLE:")
print("-" * 70)
try:
    sports_res = supabase.table('sports').select('*').limit(10).execute()
    sports = sports_res.data
    print(f"Total rows: {len(sports)}")
    
    if sports:
        print("\nSample data:")
        for sport in sports[:5]:
            print(f"  • {sport.get('sport_key')}: {sport.get('title')} ({sport.get('sport_group')})")
    else:
        print("❌ No data in sports table")
except Exception as e:
    print(f"❌ Error reading sports: {e}")

# Check events table
print("\n📊 EVENTS TABLE:")
print("-" * 70)
try:
    events_res = supabase.table('events').select('*').limit(10).execute()
    events = events_res.data
    print(f"Total rows: {len(events)}")
    
    if events:
        print("\nSample data:")
        for event in events[:5]:
            print(f"  • {event.get('home_team')} vs {event.get('away_team')}")
            print(f"    Sport: {event.get('sport_key')}, Time: {event.get('commence_time')}")
    else:
        print("❌ No data in events table")
except Exception as e:
    print(f"❌ Error reading events: {e}")

# Check bookmakers table
print("\n📊 BOOKMAKERS TABLE:")
print("-" * 70)
try:
    bookmakers_res = supabase.table('bookmakers').select('*').limit(10).execute()
    bookmakers = bookmakers_res.data
    print(f"Total rows: {len(bookmakers)}")
    
    if bookmakers:
        print("\nSample data:")
        for bm in bookmakers[:5]:
            print(f"  • {bm.get('bookmaker_key')}: {bm.get('title')}")
    else:
        print("❌ No data in bookmakers table")
except Exception as e:
    print(f"❌ Error reading bookmakers: {e}")

# Check odds_snapshots table
print("\n📊 ODDS_SNAPSHOTS TABLE:")
print("-" * 70)
try:
    odds_res = supabase.table('odds_snapshots').select('*').limit(10).execute()
    odds = odds_res.data
    print(f"Total rows: {len(odds)}")
    
    if odds:
        print("\nSample data:")
        for odd in odds[:3]:
            print(f"  • Event: {odd.get('event_id')}")
            print(f"    Bookmaker: {odd.get('bookmaker_key')}, Market: {odd.get('market_key')}")
            print(f"    Outcomes: {len(odd.get('outcomes', []))} options")
    else:
        print("❌ No data in odds_snapshots table")
except Exception as e:
    print(f"❌ Error reading odds_snapshots: {e}")

# Get counts for all tables
print("\n" + "=" * 70)
print("📈 SUMMARY - Row Counts:")
print("=" * 70)

tables = ['sports', 'events', 'bookmakers', 'odds_snapshots']
for table in tables:
    try:
        res = supabase.table(table).select('*', count='exact').limit(1).execute()
        count = res.count
        print(f"  {table:20} {count:>6} rows")
    except Exception as e:
        print(f"  {table:20} ERROR: {e}")

print("\n" + "=" * 70)
print("✅ Database check complete!")
print("\nTo view in Supabase Dashboard:")
print(f"  {SUPABASE_URL.replace('https://', 'https://app.supabase.com/project/')}")
