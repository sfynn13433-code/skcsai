# Environment Setup Guide

## ⚠️ CRITICAL: Missing SUPABASE_SERVICE_ROLE_KEY

Your `.env` file currently has:
- ✅ SUPABASE_URL (set)
- ❌ SUPABASE_SERVICE_ROLE_KEY (MISSING - this is why writes are failing!)
- ✅ ODDS_API_KEY (set)

## 🔧 How to Fix

Add this line to your `.env` file:

```bash
SUPABASE_SERVICE_ROLE_KEY=your_actual_service_role_key_here
```

### Where to find your Service Role Key:

1. Go to your Supabase project dashboard
2. Click on **Settings** (gear icon)
3. Click on **API** in the left sidebar
4. Under "Project API keys", find the **service_role** key (NOT the anon key)
5. Copy the entire key
6. Paste it into your `.env` file

### Why Service Role Key is Required:

- The **anon key** has Row Level Security (RLS) restrictions
- The **service_role key** bypasses RLS and allows writes
- Without it, Supabase will silently reject your data inserts

## Complete .env Template

Your `.env` file should look like this:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  # Optional fallback

# Odds API
ODDS_API_KEY=your_odds_api_key_here

# Sport-Specific API Keys (optional)
API_FOOTBALL_KEY=your_football_api_key_here
API_NBA_KEY=your_nba_api_key_here
API_NFL_KEY=your_nfl_api_key_here
```

## 🧪 Test After Setup

Once you've added the service role key, run:

```bash
python deep_debug_sync.py
```

You should see:
- ✅ Connection to Supabase established
- ✅ Data written successfully
- ✅ Data verified in database

## 🚨 Security Warning

**NEVER commit your service_role key to Git!**

The `.env` file is already in `.gitignore`, but double-check:
- Never share your service_role key publicly
- Never commit it to version control
- Keep it secure like a password
