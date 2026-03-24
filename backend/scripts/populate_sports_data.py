#!/usr/bin/env python3
"""populate_sports_data.py
-----------------------
Pull data from API‑SPORTS into Supabase.
Supported sports: football, basketball, rugby, etc.
Add more by editing SPORT_CONFIG.
"""

import os, sys, time
from typing import Dict, List, Any

import requests
from supabase import create_client, Client
from dotenv import load_dotenv

# ---------- Load env vars ----------
load_dotenv()
SUPABASE_URL   = os.getenv('SUPABASE_URL')
SUPABASE_KEY   = os.getenv('SUPABASE_ANON_KEY')
APISPORTS_KEY  = os.getenv('APISPORSTS_KEY')

if not all([SUPABASE_URL, SUPABASE_KEY, APISPORTS_KEY]):
    sys.exit('❌  Missing env vars – check .env file')

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ---------- Sport config ----------
SPORT_CONFIG = {
    'football': {
        'base'        : 'https://v3.football.api-sports.io',
        'leagues'    : '/leagues',
        'teams'      : '/teams',
        'players'    : '/players/squads',
        'season_param': 'season',
    },
    'basketball': {
        'base'        : 'https://v2.nba.api-sports.io',
        'leagues'    : '/leagues',
        'teams'      : '/teams',
        'players'    : '/players',
        'season_param': 'season',
    },
    # Add more sports here if you like (e.g., rugby, baseball)
}

HEADERS = {'x-apisports-key': APISPORTS_KEY}

# ---------- Helper: fetch with pagination ----------
def fetch(url: str, params: Dict = None) -> List[Dict]:
    items = []
    page = 1
    while True:
        p = dict(params or {})
        p['page'] = page
        r = requests.get(url, headers=HEADERS, params=p)
        if r.status_code != 200:
            raise RuntimeError(f'API error {r.status_code}: {r.text}')
        data = r.json()
        items.extend(data.get('response', []))
        paging = data.get('paging', {})
        if paging.get('current', 1) >= paging.get('total', 1):
            break
        page += 1
        time.sleep(0.2)   # be gentle to the free‑plan quota
    return items

# ---------- Upsert helpers (Supabase) ----------
def upsert(table: str, payload: Dict, conflict: str) -> int:
    supabase.table(table).upsert(payload, on_conflict=conflict).execute()
    row = supabase.table(table).select('id').eq(conflict.split(',')[0],
                payload[conflict.split(',')[0]]).single().execute()
    return row.data['id']

def upsert_sport(slug: str, name: str) -> int:
    return upsert('sports', {'slug': slug, 'name': name}, 'slug')

def upsert_league(sport_id: int, api_id: int, name: str,
                  country: str, season: int) -> int:
    return upsert('leagues',
                  {'api_id': api_id, 'sport_id': sport_id,
                   'name': name, 'country': country, 'season': season},
                  'api_id,sport_id')

def upsert_team(league_id: int, api_id: int, name: str,
                country: str, logo: str) -> int:
    return upsert('teams',
                  {'api_id': api_id, 'league_id': league_id,
                   'name': name, 'country': country, 'logo': logo},
                  'api_id,league_id')

def upsert_player(team_id: int, api_id: int, name: str,
                 age: int|None, number: int|None,
                 position: str|None, photo: str|None) -> None:
    supabase.table('players').upsert({
        'api_id'  : api_id,
        'team_id' : team_id,
        'name'    : name,
        'age'     : age,
        'number'  : number,
        'position': position,
        'photo'   : photo,
    }, on_conflict='api_id,team_id').execute()

# ---------- Core import ----------
def import_sport(slug: str) -> None:
    if slug not in SPORT_CONFIG:
        raise ValueError(f'⚠️ Unknown sport {slug!r}')
    cfg = SPORT_CONFIG[slug]
    base = cfg['base']
    print(f'\n🚀  Importing {slug} (base {base})')
    sport_id = upsert_sport(slug, slug.title())

    # ---- Leagues -------------------------------------------------
    leagues = fetch(f"{base}{cfg['leagues']}")
    print(f'   📚  {len(leagues)} leagues returned')
    for league in leagues:
        info = league['league']
        api_id = info['id']
        name = info['name']
        country = info.get('country')
        seasons = info.get('seasons', [])
        if not seasons:
            continue
        season = max(seasons)               # most recent season
        league_id = upsert_league(sport_id, api_id, name, country, season)

        # ---- Teams -------------------------------------------------
        team_params = {'league': api_id, cfg['season_param']: season}
        raw_teams = fetch(f"{base}{cfg['teams']}", team_params)
        print(f'      🏟️  {len(raw_teams)} teams for {name} ({season})')
        for wrapper in raw_teams:
            team_obj = wrapper.get('team') or wrapper
            t_id = team_obj['id']
            t_name = team_obj['name']
            t_country = team_obj.get('country')
            logo = team_obj.get('logo') or ''
            team_id = upsert_team(league_id, t_id, t_name, t_country, logo)

            # ---- Players -------------------------------------------
            player_params = {'team': t_id}
            raw_players = fetch(f"{base}{cfg['players']}", player_params)
            # football returns dict with "players" list; nba returns flat list.
            players = (raw_players[0].get('players')
                       if slug == 'football' else raw_players)
            for p in players:
                p_id = p['id']
                p_name = f"{p.get('firstname','')}{' ' if p.get('firstname') else ''}{p.get('lastname','')}".strip()
                age = p.get('age')
                number = p.get('number')
                position = p.get('position')
                photo = p.get('photo') or ''
                upsert_player(team_id, p_id, p_name, age, number, position, photo)

    print(f'✅  Finished {slug}')

# ---------- CLI ----------
if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit('Usage: populate_sports_data.py <sport|all>')
    arg = sys.argv[1].lower()
    if arg == 'all':
        for s in SPORT_CONFIG:
            import_sport(s)
    else:
        import_sport(arg)
