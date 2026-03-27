"""Test the predictions API directly to see what it returns"""
import requests
import json

# Test the API for each sport
BASE_URL = "http://localhost:3000"
# Or if using the deployed version:
# BASE_URL = "https://skcsai.onrender.com"

SPORTS = ['football', 'rugby', 'afl', 'baseball', 'basketball', 'formula1', 
          'cricket', 'nfl', 'hockey', 'mma', 'handball', 'volleyball']

print("🔍 TESTING PREDICTIONS API FOR EACH SPORT")
print("=" * 70)

try:
    for sport in SPORTS:
        url = f"{BASE_URL}/api/predictions?tier=normal&sport={sport}"
        print(f"\n📡 Testing {sport}...")
        
        try:
            response = requests.get(url, headers={'x-api-key': 'skcs_user_12345'}, timeout=5)
            
            if response.status_code == 200:
                data = response.json()
                count = data.get('count', 0)
                predictions = data.get('predictions', [])
                
                print(f"  ✅ {count} predictions returned")
                
                if predictions:
                    first = predictions[0]
                    matches = first.get('matches', [])
                    if matches:
                        m = matches[0]
                        print(f"     Sample: {m.get('home_team')} vs {m.get('away_team')}")
            else:
                print(f"  ❌ HTTP {response.status_code}: {response.text[:100]}")
                
        except Exception as e:
            print(f"  ❌ Error: {e}")
            
except KeyboardInterrupt:
    print("\n\nStopped by user")

print("\n" + "=" * 70)
print("If localhost:3000 is not running, try:")
print("  1. Start the backend: cd backend && npm start")
print("  2. Or use the deployed URL: https://skcsai.onrender.com")
