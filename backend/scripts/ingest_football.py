import os
import httpx
import asyncio
from datetime import datetime
from dotenv import load_dotenv
from pathlib import Path
from supabase import create_client

# Load environment variables
env_path = Path(__file__).parent / '.env'
load_dotenv(env_path)
load_dotenv()

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
API_KEY = os.getenv("X_APISPORTS_KEY")
BASE_URL = "https://v3.football.api-sports.io"

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

async def ingest_today_football():
    headers = {
        "x-apisports-key": API_KEY,
        "x-apisports-host": "v3.football.api-sports.io"
    }

    today = datetime.now().strftime("%Y-%m-%d")
    endpoint = f"{BASE_URL}/fixtures?date={today}"

    print(f"📡 Fetching live football data for {today}...")

    async with httpx.AsyncClient() as client:
        response = await client.get(endpoint, headers=headers, timeout=15.0)
        response.raise_for_status()
        data = response.json()
        fixtures = data.get("response", [])

        print(f"✅ Downloaded {len(fixtures)} fixtures. Starting database insertion...\n")

        # Let's just process the first 5 for our initial test so we don't spam the DB
        for match in fixtures:
            league_name = match["league"]["name"]
            country = match["league"]["country"]

            home_team = match["teams"]["home"]
            away_team = match["teams"]["away"]

            fixture_info = match["fixture"]

            try:
                # 1. UPSERT HOME TEAM (Insert if new, update if exists)
                home_data = {
                    "sport": "football",
                    "provider_id": str(home_team["id"]),
                    "name": home_team["name"],
                    "country": country
                }
                home_res = supabase.table("canonical_entities").upsert(home_data, on_conflict="provider_id,sport").execute()
                home_internal_id = home_res.data[0]["id"]

                # 2. UPSERT AWAY TEAM
                away_data = {
                    "sport": "football",
                    "provider_id": str(away_team["id"]),
                    "name": away_team["name"],
                    "country": country
                }
                away_res = supabase.table("canonical_entities").upsert(away_data, on_conflict="provider_id,sport").execute()
                away_internal_id = away_res.data[0]["id"]

                # 3. INSERT THE MATCH EVENT
                event_data = {
                    "sport": "football",
                    "competition_name": league_name,
                    "season": str(match["league"]["season"]),
                    "start_time_utc": fixture_info["date"],
                    "status": fixture_info["status"]["long"],
                    "home_entity_id": home_internal_id,
                    "away_entity_id": away_internal_id,
                    "provider_name": "API-SPORTS",
                    "raw_provider_data": match  # We save the raw JSON just in case!
                }

                # Insert the event
                supabase.table("canonical_events").insert(event_data).execute()

                print(f"💾 Saved Match: {home_team['name']} vs {away_team['name']} ({league_name})")

            except Exception as e:
                print(f"❌ Error saving match {home_team['name']} vs {away_team['name']}: {e}")

        print("\n🧠 SKCS AI Canonical Database updated successfully!")

if __name__ == "__main__":
    asyncio.run(ingest_today_football())