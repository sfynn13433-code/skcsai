import os
from dotenv import load_dotenv
from pathlib import Path

# Load from backend/scripts/.env
env_path = Path(__file__).parent / 'backend' / 'scripts' / '.env'
load_dotenv(env_path)

print("API Keys Check:")
print("=" * 60)

api_keys = [
    'API_FOOTBALL_KEY',
    'X_APISPORTS_KEY',
    'RAPIDAPI_KEY',
    'X_RAPIDAPI_KEY',
    'API_NBA_KEY',
    'API_NFL_KEY',
]

for key in api_keys:
    value = os.getenv(key)
    if value:
        print(f"✅ {key}: SET ({value[:30]}...)")
    else:
        print(f"❌ {key}: MISSING")

print("\n" + "=" * 60)
print("\nThe populate_sports_data.py script needs:")
print("- API_FOOTBALL_KEY for football data")
print("- Or X_APISPORTS_KEY as fallback")
print("\nAdd to backend/scripts/.env:")
print("API_FOOTBALL_KEY=your_api_football_key_here")
