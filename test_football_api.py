"""Test the football API authentication directly"""
import os
import requests
from dotenv import load_dotenv
from pathlib import Path

# Load from backend/scripts/.env
env_path = Path(__file__).parent / 'backend' / 'scripts' / '.env'
load_dotenv(env_path)

X_APISPORTS_KEY = os.getenv('X_APISPORTS_KEY')
RAPIDAPI_KEY = os.getenv('RAPIDAPI_KEY')

print("Testing Football API Authentication")
print("=" * 60)

# Test with X_APISPORTS_KEY
if X_APISPORTS_KEY:
    print(f"\n✅ X_APISPORTS_KEY found: {X_APISPORTS_KEY[:20]}...")
    
    headers = {'x-apisports-key': X_APISPORTS_KEY}
    url = "https://v3.football.api-sports.io/leagues"
    
    print(f"Testing API call to: {url}")
    print(f"Headers: {{'x-apisports-key': '{X_APISPORTS_KEY[:20]}...'}}")
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        print(f"\nResponse Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ API Call SUCCESS!")
            print(f"Response keys: {list(data.keys())}")
            
            if data.get('errors'):
                print(f"❌ API Errors: {data['errors']}")
            else:
                print(f"✅ No errors in response")
                print(f"Results count: {len(data.get('response', []))}")
        else:
            print(f"❌ API Call Failed: {response.text[:200]}")
    except Exception as e:
        print(f"❌ Request Exception: {e}")
else:
    print("❌ X_APISPORTS_KEY not found in environment")

# Test with RAPIDAPI_KEY
if RAPIDAPI_KEY:
    print(f"\n\n✅ RAPIDAPI_KEY found: {RAPIDAPI_KEY[:20]}...")
    
    headers = {'x-rapidapi-key': RAPIDAPI_KEY}
    url = "https://v3.football.api-sports.io/leagues"
    
    print(f"Testing API call to: {url}")
    print(f"Headers: {{'x-rapidapi-key': '{RAPIDAPI_KEY[:20]}...'}}")
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        print(f"\nResponse Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ API Call SUCCESS!")
            print(f"Response keys: {list(data.keys())}")
            
            if data.get('errors'):
                print(f"❌ API Errors: {data['errors']}")
            else:
                print(f"✅ No errors in response")
                print(f"Results count: {len(data.get('response', []))}")
        else:
            print(f"❌ API Call Failed: {response.text[:200]}")
    except Exception as e:
        print(f"❌ Request Exception: {e}")
