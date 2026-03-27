"""Test all available API keys with different header combinations"""
import os
import requests
from dotenv import load_dotenv
from pathlib import Path

# Load from backend/scripts/.env
env_path = Path(__file__).parent / 'backend' / 'scripts' / '.env'
load_dotenv(env_path)

X_APISPORTS_KEY = os.getenv('X_APISPORTS_KEY')
RAPIDAPI_KEY = os.getenv('RAPIDAPI_KEY')
X_RAPIDAPI_KEY = os.getenv('X_RAPIDAPI_KEY')

print("Testing All API Key Combinations for Football API")
print("=" * 70)

# Test configurations
tests = [
    {
        'name': 'X_APISPORTS_KEY with x-apisports-key header',
        'key': X_APISPORTS_KEY,
        'headers': lambda k: {'x-apisports-key': k},
        'url': 'https://v3.football.api-sports.io/leagues'
    },
    {
        'name': 'RAPIDAPI_KEY with x-apisports-key header',
        'key': RAPIDAPI_KEY,
        'headers': lambda k: {'x-apisports-key': k},
        'url': 'https://v3.football.api-sports.io/leagues'
    },
    {
        'name': 'RAPIDAPI_KEY with x-rapidapi-key header (RapidAPI)',
        'key': RAPIDAPI_KEY,
        'headers': lambda k: {
            'x-rapidapi-key': k,
            'x-rapidapi-host': 'api-football-v1.p.rapidapi.com'
        },
        'url': 'https://api-football-v1.p.rapidapi.com/v3/leagues'
    },
    {
        'name': 'X_RAPIDAPI_KEY with x-rapidapi-key header (RapidAPI)',
        'key': X_RAPIDAPI_KEY,
        'headers': lambda k: {
            'x-rapidapi-key': k,
            'x-rapidapi-host': 'api-football-v1.p.rapidapi.com'
        },
        'url': 'https://api-football-v1.p.rapidapi.com/v3/leagues'
    },
]

working_configs = []

for test in tests:
    print(f"\n{'='*70}")
    print(f"Test: {test['name']}")
    print(f"Key: {test['key'][:20] if test['key'] else 'MISSING'}...")
    print(f"URL: {test['url']}")
    
    if not test['key']:
        print("❌ Key not available")
        continue
    
    try:
        headers = test['headers'](test['key'])
        response = requests.get(test['url'], headers=headers, timeout=10)
        
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            if data.get('errors'):
                errors = data['errors']
                print(f"⚠️ API returned errors: {errors}")
                
                # Check if it's just a rate limit (not an auth error)
                if 'limit' in str(errors).lower() or 'quota' in str(errors).lower():
                    print("⏳ Rate limited but authentication works!")
                    working_configs.append({
                        'test': test['name'],
                        'status': 'rate_limited',
                        'url': test['url'],
                        'headers': headers
                    })
            else:
                results = len(data.get('response', []))
                print(f"✅ SUCCESS! Got {results} results")
                working_configs.append({
                    'test': test['name'],
                    'status': 'working',
                    'url': test['url'],
                    'headers': headers
                })
        else:
            print(f"❌ Failed with status {response.status_code}")
            print(f"Response: {response.text[:200]}")
            
    except Exception as e:
        print(f"❌ Exception: {e}")

print("\n" + "=" * 70)
print("\nSUMMARY - Working API Configurations:")
print("=" * 70)

if working_configs:
    for config in working_configs:
        print(f"\n✅ {config['test']}")
        print(f"   Status: {config['status']}")
        print(f"   URL: {config['url']}")
        print(f"   Headers: {list(config['headers'].keys())}")
else:
    print("\n❌ No working API configurations found")
    print("\nPossible issues:")
    print("1. All API keys have reached their daily limits")
    print("2. API keys need to be activated/configured")
    print("3. Different API endpoint needed")
