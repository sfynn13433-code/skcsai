import os
import requests
import json
import logging
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client

# Setup logging to see exactly what's happening
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("DeepDebug")

# 1. Load Environment
# Try multiple .env file locations
from pathlib import Path
env_paths = [
    Path(__file__).parent / 'backend' / 'scripts' / '.env',  # Try backend/scripts first
    Path(__file__).parent / '.env',
    Path(__file__).parent / '.env.local',
]

loaded = False
for env_path in env_paths:
    if env_path.exists():
        load_dotenv(env_path, override=True)
        logger.info(f"✅ Loaded environment from: {env_path}")
        loaded = True
        break

if not loaded:
    load_dotenv()  # Try default locations
    logger.warning("⚠️ Using default .env location")

SUPABASE_URL = os.getenv("SUPABASE_URL")
# CRITICAL: This MUST be the 'service_role' key to bypass RLS
# Try multiple possible key names
SUPABASE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY") or 
    os.getenv("SUPABASE_KEY") or 
    os.getenv("SERVICE_ROLE_KEY") or
    os.getenv("SUPABASE_ANON_KEY")  # Last resort - will show warning
)
ODDS_API_KEY = os.getenv("ODDS_API_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    logger.error("❌ MISSING CREDENTIALS: Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env")
    logger.error(f"SUPABASE_URL: {'SET' if SUPABASE_URL else 'MISSING'}")
    logger.error(f"SUPABASE_KEY: {'SET' if SUPABASE_KEY else 'MISSING'}")
    exit(1)

# Check if we're using anon key (not ideal)
if SUPABASE_KEY == os.getenv("SUPABASE_ANON_KEY"):
    logger.warning("⚠️ WARNING: Using SUPABASE_ANON_KEY - writes may fail due to RLS policies!")
    logger.warning("⚠️ For production, use SUPABASE_SERVICE_ROLE_KEY instead")
else:
    logger.info("✅ Using service role key for database access")

# Initialize Supabase Client
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def run_deep_sync():
    logger.info(f"🚀 Starting Deep Debug Sync at {datetime.now().isoformat()}")
    
    # --- STEP 1: TEST CONNECTIVITY ---
    try:
        test_res = supabase.table("sports").select("count", count="exact").limit(1).execute()
        logger.info(f"✅ Connection to Supabase established. Current 'sports' row count: {test_res.count}")
    except Exception as e:
        logger.error(f"❌ Initial Connection Failed: {e}")
        return

    # --- STEP 2: ATTEMPT INSERT ---
    test_sport_key = f"test_sport_{int(datetime.now().timestamp())}"
    sport_payload = {
        "sport_key": test_sport_key,
        "sport_group": "Debug",
        "title": "Debug Test League",
        "description": "If you see this, the write worked.",
        "active": True
    }

    logger.info(f"--- Phase 1: Attempting Write to 'sports' table ---")
    try:
        # We use upsert to ensure we don't fail on duplicates
        insert_res = supabase.table("sports").upsert(sport_payload).execute()
        
        if insert_res.data:
            logger.info(f"✅ Supabase reported SUCCESS. Data returned: {json.dumps(insert_res.data, indent=2)}")
            
            # --- STEP 3: THE VERIFICATION READ-BACK (THE TRUTH) ---
            logger.info("--- Phase 2: Verifying Write (Read-Back) ---")
            verify_res = supabase.table("sports").select("*").eq("sport_key", test_sport_key).execute()
            
            if verify_res.data and len(verify_res.data) > 0:
                logger.info(f"🎉 DATA VERIFIED: Found the row in the database! Row ID: {verify_res.data[0].get('id')}")
                logger.info("The issue might be the specific sport keys you were using previously.")
            else:
                logger.error("🚨 SILENT FAILURE DETECTED: Supabase said the write worked, but the table is EMPTY.")
                logger.error("CAUSES: 1) Row Level Security (RLS) is ON. 2) A Database Trigger is deleting the row. 3) You are using the 'anon' key instead of 'service_role'.")
        else:
            logger.warning("⚠️ Supabase returned an empty data array. This is a sign of a permission block.")

    except Exception as e:
        logger.error(f"❌ Database Operation CRASHED: {e}")

    # --- STEP 4: FETCH LIVE ODDS (OPTIONAL TEST) ---
    if ODDS_API_KEY:
        logger.info("--- Phase 3: Testing Odds API Fetch ---")
        odds_url = f"https://api.the-odds-api.com/v4/sports/soccer_epl/odds/?apiKey={ODDS_API_KEY}&regions=us&markets=h2h"
        try:
            r = requests.get(odds_url)
            if r.status_code == 200:
                logger.info(f"✅ Odds API Success. Found {len(r.json())} upcoming games.")
            else:
                logger.error(f"❌ Odds API Error {r.status_code}: {r.text}")
        except Exception as e:
            logger.error(f"❌ Odds API Fetch Crashed: {e}")

if __name__ == "__main__":
    run_deep_sync()
