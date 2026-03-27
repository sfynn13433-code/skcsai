import os
from dotenv import load_dotenv

load_dotenv()

print("Environment Variables Check:")
print("=" * 50)

vars_to_check = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_KEY',
    'SUPABASE_ANON_KEY',
    'ODDS_API_KEY',
    'API_FOOTBALL_KEY'
]

for var in vars_to_check:
    value = os.getenv(var)
    if value:
        print(f"✅ {var}: SET ({value[:40]}...)")
    else:
        print(f"❌ {var}: MISSING")

print("\n" + "=" * 50)
print("\nTo fix missing SUPABASE_SERVICE_ROLE_KEY:")
print("Add this line to your .env file:")
print("SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here")
