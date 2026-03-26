# Live Sports API Setup

## Getting Real Fixture Data

The SKCS system now fetches **REAL, LIVE fixtures** from the-odds-api.com instead of using hardcoded data.

### Step 1: Get a Free API Key

1. Visit https://the-odds-api.com/
2. Sign up for a free account
3. Copy your API key

### Step 2: Add API Key to Environment

Open `backend/scripts/.env` and add this line:

```
ODDS_API_KEY=your_api_key_here
```

Replace `your_api_key_here` with your actual API key from the-odds-api.com.

**Location:** `c:\Users\skcsa\OneDrive\Desktop\SKCS Things\SKCS-test\backend\scripts\.env`

If the file doesn't exist, create it with:
```
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ODDS_API_KEY=your_odds_api_key
```

### Step 3: Run the Fixture Loader

```bash
python fetch_live_api_fixtures.py
```

This will:
- Fetch real fixtures from the-odds-api.com
- Parse the JSON response
- Extract team names, dates, and odds
- Upload to Supabase
- Display on your website

### Supported Sports

Currently fetching live data for:
- ⚽ Football (Premier League)
- 🏀 Basketball (NBA)
- 🏒 Hockey (NHL)
- ⚾ Baseball (MLB)

### How It Works

1. **API Request**: Makes HTTP request to the-odds-api.com with your API key
2. **Real Data**: Extracts actual fixture data (teams, dates, odds)
3. **Prediction Logic**: Uses odds to inform prediction confidence
4. **Supabase Upload**: Stores real fixtures in your database
5. **Website Display**: Frontend fetches and displays live predictions

### Scheduling

To run this automatically:

**Option A: GitHub Actions (Recommended)**
- Already configured in `.github/workflows/skcs-sync.yml`
- Runs at 04:00, 12:00, 18:00 UTC daily

**Option B: Manual**
```bash
python fetch_live_api_fixtures.py
```

**Option C: Cron Job**
```bash
0 4,12,18 * * * cd /path/to/skcs-test && python fetch_live_api_fixtures.py
```

### Free Tier Limits

The-odds-api.com free tier includes:
- ✅ 500 requests per month
- ✅ Real-time odds data
- ✅ Multiple sports
- ✅ Historical data

### Troubleshooting

**No predictions loaded?**
- Check API key is valid
- Verify ODDS_API_KEY is set in `.env`
- Check network connection
- Ensure fixtures exist for today

**Wrong data?**
- API returns real fixtures only
- Dates are in UTC
- Teams are official names from API

### Next Steps

1. Get API key from https://the-odds-api.com/
2. Add to `backend/scripts/.env`
3. Run `python fetch_live_api_fixtures.py`
4. Refresh website to see live predictions
