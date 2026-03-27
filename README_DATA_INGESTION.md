# Sports Data Ingestion Requirements

## Core Libraries (No API Keys Required)

### NBA Data
- **Library**: `nba_api`
- **Source**: NBA.com public stats endpoints
- **Install**: `pip install nba_api`
- **Usage**: Teams, rosters, player stats, game schedules
- **Notes**: No authentication required for public endpoints

### NFL Data  
- **Library**: `nfl_data_py`
- **Source**: nflfastR data repository (open-source)
- **Install**: `pip install nfl_data_py`
- **Usage**: Teams, rosters, player stats, injury reports, game data
- **Notes**: Uses publicly available NFL play-by-play data

### MLB Data
- **Library**: `mlb-statsapi` (statsapi)
- **Source**: MLB official public API
- **Install**: `pip install mlb-statsapi`
- **Usage**: Teams, rosters, player stats, game data
- **Notes**: Free tier available, no authentication for basic stats

### Formula 1 Data
- **Library**: `fastf1`
- **Source**: F1 live timing service (public)
- **Install**: `pip install fastf1`
- **Usage**: Race data, driver telemetry, session information
- **Notes**: Public F1 timing data

### NHL Data
- **Library**: `nhlapi` (community wrapper) or direct HTTP
- **Source**: NHL public API (`https://api-web.nhle.com/v1/`)
- **Install**: `pip install nhlapi` or use requests directly
- **Usage**: Teams, rosters, player stats, game data
- **Notes**: Completely undocumented but public API

## Dependencies

```bash
# Core requirements
pip install nba_api nfl_data_py mlb-statsapi fastf1 pandas requests python-dotenv pydantic

# Optional for NHL
pip install nhlapi
```

## Environment Setup

1. Copy `.env.example` to `.env`
2. Add your API keys (only for services that require them)
3. The core libraries work without API keys

## Directory Structure

```
project/
├── models/
│   ├── sport_models.py          # Pydantic models for sports data
│   └── odds_schema.py           # Odds API models
├── services/
│   ├── nba_service.py           # NBA data service
│   ├── nfl_service.py           # NFL data service
│   ├── odds_api_service.py      # Odds API integration
│   └── data_ingestion.py       # Unified interface
├── demo_sports_data.py          # Quick start demo
└── .env.example                 # Environment template
```

## Strict Constraints

✅ **ALLOWED**:
- Official API endpoints with public access
- Open-source Python libraries (nba_api, nfl_data_py, etc.)
- Public athletic profile data (stats, teams, games)
- Structured JSON/CSV data sources

❌ **FORBIDDEN**:
- Web scraping (BeautifulSoup, Selenium, Puppeteer)
- Private/personal information (addresses, family, non-public issues)
- Unauthorized data sources
- HTML parsing libraries

## Usage Examples

```python
from services.data_ingestion import data_service
from services.odds_api_service import odds_service

# NBA data
teams = data_service.get_nba_teams()
players = data_service.get_nba_players()
games = data_service.get_nba_games()

# NFL data  
teams = data_service.get_nfl_teams()
players = data_service.get_nfl_players()
injuries = data_service.get_nfl_injuries()

# Odds data
sports = odds_service.get_active_sports()
nba_odds = odds_service.get_event_odds("basketball_nba")
```

## Data Types Available

### NBA
- Team information (name, conference, division)
- Player rosters and demographics
- Game schedules and results
- Player statistics (points, assists, rebounds, etc.)
- Game box scores

### NFL
- Team information (name, conference, division)
- Player rosters and positions
- Game schedules and results
- Player statistics (passing, rushing, receiving, etc.)
- Injury reports

### Odds API
- Real-time betting odds
- Multiple bookmakers
- Various markets (moneyline, spreads, totals)
- Sport coverage across major leagues
