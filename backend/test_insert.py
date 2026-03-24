import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Adjust the table name if you used a different one
TABLE = "api_raw"

sample_row = {
    "source": "test",
    "endpoint": "demo/simple",
    "payload": {"hello": "world", "num": 42}
}

resp = supabase.table(TABLE).insert([sample_row]).execute()
if resp.error:
    print("❌ Insert error:", resp.error)
else:
    print("✅ Inserted row, id(s):", [r["id"] for r in resp.data])
