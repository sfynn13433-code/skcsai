#!/usr/bin/env python3
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
from dotenv import load_dotenv
from supabase import create_client


SCRIPT_DIR = Path(__file__).resolve().parent
load_dotenv(SCRIPT_DIR / '.env', override=True)

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
# API Keys for different sports
API_FOOTBALL_KEY = os.getenv('API_FOOTBALL_KEY')
API_NBA_KEY = os.getenv('API_NBA_KEY')
API_NFL_KEY = os.getenv('API_NFL_KEY')
API_BASKETBALL_KEY = os.getenv('API_BASKETBALL_KEY')
API_HOCKEY_KEY = os.getenv('API_HOCKEY_KEY')
API_BASEBALL_KEY = os.getenv('API_BASEBALL_KEY')
API_RUGBY_KEY = os.getenv('API_RUGBY_KEY')
API_AFL_KEY = os.getenv('API_AFL_KEY')
API_FORMULA1_KEY = os.getenv('API_FORMULA1_KEY')
API_MMA_KEY = os.getenv('API_MMA_KEY')
API_VOLLEYBALL_KEY = os.getenv('API_VOLLEYBALL_KEY')
API_HANDBALL_KEY = os.getenv('API_HANDBALL_KEY')

# Fallback keys
RAPIDAPI_KEY = os.getenv('RAPIDAPI_KEY')
X_APISPORTS_KEY = os.getenv('X_APISPORTS_KEY')
ODDS_API_KEY = os.getenv('ODDS_API_KEY')
X_RAPIDAPI_KEY = os.getenv('X_RAPIDAPI_KEY')
CRICKETDATA_API_KEY = os.getenv('CRICKETDATA_API_KEY')


REQUIRED = {
    'SUPABASE_URL': SUPABASE_URL,
    'SUPABASE_SERVICE_ROLE_KEY': SUPABASE_SERVICE_ROLE_KEY,
}

missing = [k for k, v in REQUIRED.items() if not v]
if missing:
    sys.exit(f"Missing required env vars: {', '.join(missing)}")

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def column_exists(table: str, column: str) -> bool:
    try:
        supabase.table(table).select(column).limit(1).execute()
        return True
    except Exception as exc:
        msg = str(exc)
        if 'schema cache' in msg or 'PGRST204' in msg:
            return False
        return False


LEAGUE_API_COL = 'api_id' if column_exists('leagues', 'api_id') else ('api_league_id' if column_exists('leagues', 'api_league_id') else None)
LEAGUE_HAS_SPORT_ID = column_exists('leagues', 'sport_id')
LEAGUE_HAS_SPORT_TEXT = column_exists('leagues', 'sport')
LEAGUE_HAS_COUNTRY = column_exists('leagues', 'country')
LEAGUE_HAS_SEASON = column_exists('leagues', 'season')

TEAM_API_COL = 'api_id' if column_exists('teams', 'api_id') else ('api_team_id' if column_exists('teams', 'api_team_id') else None)
TEAM_HAS_COUNTRY = column_exists('teams', 'country')
TEAM_HAS_LOGO = column_exists('teams', 'logo')

PLAYER_API_COL = 'api_id' if column_exists('players', 'api_id') else ('api_player_id' if column_exists('players', 'api_player_id') else None)
PLAYER_HAS_AGE = column_exists('players', 'age')
PLAYER_HAS_NUMBER = column_exists('players', 'number')
PLAYER_HAS_POSITION = column_exists('players', 'position')
PLAYER_HAS_PHOTO = column_exists('players', 'photo')


SPORT_CONFIG = {
    'football': {
        'base': 'https://v3.football.api-sports.io',
        'leagues': '/leagues',
        'teams': '/teams',
        'players': '/players/squads',
        'season_param': 'season',
    },
    'nba': {
        'base': 'https://v2.nba.api-sports.io',
        'leagues': '/leagues',
        'teams': '/teams',
        'players': '/players',
        'season_param': 'season',
    },
    'basketball': {
        'base': 'https://v1.basketball.api-sports.io',
        'leagues': '/leagues',
        'teams': '/teams',
        'players': '/players',
        'season_param': 'season',
    },
    'hockey': {
        'base': 'https://v1.hockey.api-sports.io',
        'leagues': '/leagues',
        'teams': '/teams',
        'players': '/players',
        'season_param': 'season',
    },
    'afl': {
        'base': 'https://v1.afl.api-sports.io',
        'leagues': '/leagues',
        'teams': '/teams',
        'players': '/players',
        'season_param': 'season',
    },
    'baseball': {
        'base': 'https://v1.baseball.api-sports.io',
        'leagues': '/leagues',
        'teams': '/teams',
        'players': None,
        'season_param': 'season',
    },
    'nfl': {
        'base': 'https://v1.american-football.api-sports.io',
        'leagues': '/leagues',
        'teams': '/teams',
        'players': '/players',
        'season_param': 'season',
    },
    'rugby': {
        'base': 'https://v1.rugby.api-sports.io',
        'leagues': '/leagues',
        'teams': '/teams',
        'players': '/players',
        'season_param': 'season',
    },
    'volleyball': {
        'base': 'https://v1.volleyball.api-sports.io',
        'leagues': '/leagues',
        'teams': '/teams',
        'players': None,
        'season_param': 'season',
    },
    'handball': {
        'base': 'https://v1.handball.api-sports.io',
        'leagues': '/leagues',
        'teams': '/teams',
        'players': '/players',
        'season_param': 'season',
    },
    'formula1': {
        'base': 'https://v1.formula-1.api-sports.io',
        'leagues': '/competitions',
        'teams': None,
        'players': None,
        'season_param': None,
    },
    'mma': {
        'base': 'https://v1.mma.api-sports.io',
        'leagues': '/leagues',
        'teams': None,
        'players': None,
        'season_param': None,
    },
}

DEFAULT_MAX_LEAGUES = 8
DEFAULT_MAX_TEAMS = 12
DEFAULT_MAX_PLAYERS = 20
DEFAULT_INCLUDE_PLAYERS = False

LEAGUE_TARGETS: Dict[str, List[Dict[str, Any]]] = {
    'football': [
        {'country': 'england', 'names': ['premier league', 'championship']},
        {'country': 'spain', 'names': ['la liga', 'segunda división', 'segunda division']},
        {'country': 'germany', 'names': ['bundesliga', '2. bundesliga']},
        {'country': 'italy', 'names': ['serie a', 'serie b']},
        {'country': 'france', 'names': ['ligue 1', 'ligue 2']},
        {'country': None, 'names': ['uefa champions league', 'uefa europa league']},
    ],
    'nba': [
        {'country': None, 'names': ['nba', 'nba g league']},
    ],
    'basketball': [
        {'country': 'spain', 'names': ['liga acb', 'leb oro']},
        {'country': None, 'names': ['euroleague']},
    ],
    'rugby': [
        {'country': 'france', 'names': ['top 14', 'pro d2', 'rugby pro d2']},
        {'country': 'england', 'names': ['premiership', 'rfu championship']},
        {'country': None, 'names': ['united rugby championship', 'urc', 'super rugby pacific', 'six nations']},
    ],
    'nfl': [
        {'country': None, 'names': ['nfl', 'ncaa division 1 fbs', 'ncaa fbs']},
    ],
    'baseball': [
        {'country': 'usa', 'names': ['mlb', 'triple-a', 'aaa']},
        {'country': 'japan', 'names': ['npb', 'eastern league', 'western league']},
    ],
    'hockey': [
        {'country': None, 'names': ['nhl', 'ahl']},
        {'country': 'sweden', 'names': ['shl', 'hockeyallsvenskan']},
    ],
    'volleyball': [
        {'country': 'italy', 'names': ['superlega', 'serie a2']},
    ],
    'handball': [
        {'country': 'germany', 'names': ['bundesliga', '2. handball-bundesliga']},
    ],
    'afl': [
        {'country': 'australia', 'names': ['afl', 'vfl']},
    ],
    'formula1': [
        {'country': None, 'names': ['formula 1', 'world championship']},
    ],
    'mma': [
        {'country': None, 'names': ['ufc', 'bellator']},
    ],
}


def _clean(value: Optional[str]) -> str:
    return (value or '').strip().strip('"').strip("'")


def _norm(value: Optional[str]) -> str:
    return (value or '').strip().lower()


def get_sport_api_key(sport_slug: str) -> str:
    """Get the specific API key for a sport, with fallbacks."""
    key_mapping = {
        'football': API_FOOTBALL_KEY,
        'nba': API_NBA_KEY,
        'nfl': API_NFL_KEY,
        'basketball': API_BASKETBALL_KEY,
        'hockey': API_HOCKEY_KEY,
        'baseball': API_BASEBALL_KEY,
        'rugby': API_RUGBY_KEY,
        'afl': API_AFL_KEY,
        'formula1': API_FORMULA1_KEY,
        'mma': API_MMA_KEY,
        'volleyball': API_VOLLEYBALL_KEY,
        'handball': API_HANDBALL_KEY,
    }
    
    # Try sport-specific key first
    sport_key = key_mapping.get(sport_slug)
    if sport_key:
        return _clean(sport_key)
    
    # Fallback to generic keys
    x_apisports_key = _clean(X_APISPORTS_KEY)
    if x_apisports_key:
        return x_apisports_key
    
    rapidapi_key = _clean(RAPIDAPI_KEY)
    if rapidapi_key:
        return rapidapi_key
    
    x_rapidapi_key = _clean(X_RAPIDAPI_KEY)
    if x_rapidapi_key:
        return x_rapidapi_key
    
    return ""


def apisports_header_candidates() -> List[Dict[str, str]]:
    """Generate header candidates with sport-specific API keys."""
    candidates: List[Dict[str, str]] = []
    
    # Generic fallback keys
    x_apisports_key = _clean(X_APISPORTS_KEY)
    rapidapi_key = _clean(RAPIDAPI_KEY)
    x_rapidapi_key = _clean(X_RAPIDAPI_KEY)
    
    if x_apisports_key:
        candidates.append({'x-apisports-key': x_apisports_key})
    if rapidapi_key:
        candidates.append({'x-apisports-key': rapidapi_key})
    if x_rapidapi_key:
        candidates.append({'x-rapidapi-key': x_rapidapi_key})
    if rapidapi_key:
        candidates.append({'x-rapidapi-key': rapidapi_key})

    # Remove duplicates
    unique: List[Dict[str, str]] = []
    seen = set()
    for c in candidates:
        key = tuple(sorted(c.items()))
        if key in seen:
            continue
        seen.add(key)
        unique.append(c)
    return unique


def get_headers_for_sport(sport_slug: str) -> List[Dict[str, str]]:
    """Get headers specifically for a sport with its API key."""
    sport_key = get_sport_api_key(sport_slug)
    
    if not sport_key:
        # Fall back to generic candidates
        return apisports_header_candidates()
    
    # Try sport-specific key first
    candidates = [{'x-apisports-key': sport_key}]
    
    # Add generic fallbacks
    candidates.extend(apisports_header_candidates())
    
    return candidates


def fetch_api_sports(url: str, params: Optional[Dict[str, Any]] = None, max_pages: int = 1, sport_slug: Optional[str] = None) -> List[Dict[str, Any]]:
    last_error = 'Unknown API-Sports error'
    
    # Use sport-specific headers if sport_slug is provided
    header_candidates = get_headers_for_sport(sport_slug) if sport_slug else apisports_header_candidates()
    
    for headers in header_candidates:
        try:
            p = dict(params or {})
            r = requests.get(url, headers=headers, params=p, timeout=30)
            if r.status_code != 200:
                last_error = f"status={r.status_code} body={r.text[:300]}"
                raise RuntimeError(last_error)

            payload = r.json()
            payload_errors = payload.get('errors') or {}
            if payload_errors:
                last_error = f"payload errors={payload_errors}"
                raise RuntimeError(last_error)

            items = payload.get('response', []) or []
            return items
        except Exception as exc:
            last_error = str(exc)
            time.sleep(0.2)
            continue

    raise RuntimeError(f"API-Sports authentication/request failed: {last_error}")


def find_row_id(table: str, filters: Dict[str, Any]) -> Optional[int]:
    if not filters:
        return None

    # Select all columns to avoid 'id does not exist' errors
    q = supabase.table(table).select('*')
    for k, v in filters.items():
        q = q.eq(k, v)
    res = q.limit(1).execute()
    rows = res.data or []
    if not rows:
        return None
    # Try to get id, or use the first filter key value as fallback
    return rows[0].get('id') or rows[0].get(list(filters.keys())[0])


def is_target_league(sport_slug: str, league_name: str, country: Optional[str]) -> bool:
    rules = LEAGUE_TARGETS.get(sport_slug) or []
    if not rules:
        return True

    name = _norm(league_name)
    league_country = _norm(country)
    for rule in rules:
        rule_country = _norm(rule.get('country'))
        if rule_country and league_country != rule_country:
            continue

        for target_name in rule.get('names') or []:
            if _norm(target_name) in name:
                return True
    return False


def filter_target_leagues(sport_slug: str, leagues: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    filtered: List[Dict[str, Any]] = []
    for league in leagues:
        parsed = extract_league_fields(league)
        if not parsed:
            continue
        if is_target_league(sport_slug, str(parsed.get('name') or ''), parsed.get('country')):
            filtered.append(league)
    return filtered


def upsert_by_filters(table: str, payload: Dict[str, Any], filters: Dict[str, Any]) -> int:
    existing_id = find_row_id(table, filters)
    if existing_id is not None:
        update_res = supabase.table(table).update(payload).eq('id', existing_id).execute()
        print(f"UPDATE {table}: {update_res.data}")
        return existing_id

    insert_res = supabase.table(table).insert(payload).execute()
    print(f"INSERT {table}: {insert_res.data}")
    inserted = insert_res.data or []
    if inserted and inserted[0].get('id') is not None:
        return inserted[0]['id']

    inserted_id = find_row_id(table, filters)
    if inserted_id is None:
        raise RuntimeError(f'Insert succeeded but id lookup failed for {table}')
    return inserted_id


def upsert_sport(slug: str, name: str) -> int:
    # Use the actual schema: sport_key instead of key/slug
    payload = {'sport_key': slug, 'title': name}
    filters = {'sport_key': slug}
    
    # Add default values for required fields
    if column_exists('sports', 'sport_group'):
        payload['sport_group'] = 'general'
    if column_exists('sports', 'description'):
        payload['description'] = f'{name} sports data'
    if column_exists('sports', 'active'):
        payload['active'] = True
    if column_exists('sports', 'has_outrights'):
        payload['has_outrights'] = False
    if column_exists('sports', 'updated_at'):
        from datetime import datetime
        payload['updated_at'] = datetime.now().isoformat()
    
    return upsert_by_filters('sports', payload, filters)


def upsert_league(sport_id: int, sport_slug: str, api_id: int, name: str, country: Optional[str], season: int) -> int:
    payload: Dict[str, Any] = {'name': name}
    filters: Dict[str, Any] = {'name': name}

    if LEAGUE_API_COL:
        payload[LEAGUE_API_COL] = api_id
        filters[LEAGUE_API_COL] = api_id
    if LEAGUE_HAS_SPORT_ID:
        payload['sport_id'] = sport_id
        filters['sport_id'] = sport_id
    elif LEAGUE_HAS_SPORT_TEXT:
        payload['sport'] = sport_slug
        filters['sport'] = sport_slug
    if LEAGUE_HAS_COUNTRY:
        payload['country'] = country
    if LEAGUE_HAS_SEASON:
        payload['season'] = season

    return upsert_by_filters('leagues', payload, filters)


def upsert_team(league_id: int, api_id: int, name: str, country: Optional[str], logo: str, sport_key: Optional[str] = None) -> int:
    payload: Dict[str, Any] = {
        'league_id': league_id,
        'name': name,
    }
    filters: Dict[str, Any] = {
        'league_id': league_id,
        'name': name,
    }
    if TEAM_API_COL:
        payload[TEAM_API_COL] = api_id
        filters[TEAM_API_COL] = api_id
    if TEAM_HAS_COUNTRY:
        payload['country'] = country
    if TEAM_HAS_LOGO:
        payload['logo'] = logo
    # Add sport_key if column exists
    if column_exists('teams', 'sport_key') and sport_key:
        payload['sport_key'] = sport_key
        filters['sport_key'] = sport_key

    return upsert_by_filters('teams', payload, filters)


def upsert_player(team_id: int, api_id: int, name: str, age: Optional[int], number: Optional[int], position: Optional[str], photo: str) -> None:
    payload: Dict[str, Any] = {
        'team_id': team_id,
        'name': name,
    }
    filters: Dict[str, Any] = {
        'team_id': team_id,
        'name': name,
    }

    if PLAYER_API_COL:
        payload[PLAYER_API_COL] = api_id
        filters[PLAYER_API_COL] = api_id
    if PLAYER_HAS_AGE:
        payload['age'] = age
    if PLAYER_HAS_NUMBER:
        payload['number'] = number
    if PLAYER_HAS_POSITION:
        payload['position'] = position
    if PLAYER_HAS_PHOTO:
        payload['photo'] = photo

    upsert_by_filters('players', payload, filters)


def pick_latest_season(seasons: Any, fallback: int = 2024) -> int:
    if not seasons:
        return fallback

    values: List[int] = []
    for s in seasons:
        if isinstance(s, int):
            values.append(s)
            continue
        if isinstance(s, str) and s.isdigit():
            values.append(int(s))
            continue
        if isinstance(s, dict):
            raw = s.get('year') or s.get('season')
            if isinstance(raw, int):
                values.append(raw)
            elif isinstance(raw, str) and raw.isdigit():
                values.append(int(raw))

    return max(values) if values else fallback


def select_diverse_leagues(leagues: List[Dict[str, Any]], max_leagues: int) -> List[Dict[str, Any]]:
    picked: List[Dict[str, Any]] = []
    seen_countries = set()

    for league in leagues:
        if isinstance(league, dict):
            info = league.get('league') or league
            country = str((info.get('country') if isinstance(info, dict) else None) or '').strip().lower()
        else:
            info = league
            country = ''
        if country and country not in seen_countries:
            seen_countries.add(country)
            picked.append(league)
        if len(picked) >= max_leagues:
            return picked

    for league in leagues:
        if len(picked) >= max_leagues:
            break
        if league not in picked:
            picked.append(league)

    return picked


def extract_league_fields(league: Any) -> Optional[Dict[str, Any]]:
    if isinstance(league, dict):
        info = league.get('league') or league
        if not isinstance(info, dict):
            return None
        return {
            'id': info.get('id'),
            'name': info.get('name'),
            'country': info.get('country'),
            'seasons': info.get('seasons') or [],
        }

    if isinstance(league, str):
        return {
            'id': None,
            'name': league,
            'country': None,
            'seasons': [],
        }

    return None


def import_sport(
    slug: str,
    max_leagues: int = 1,
    max_teams: int = 2,
    max_players: int = 10,
    include_players: bool = False,
) -> None:
    cfg = SPORT_CONFIG[slug]
    base = cfg['base']

    print(f"\n=== Importing {slug} ===")
    sport_id = upsert_sport(slug, slug.title())

    leagues = fetch_api_sports(f"{base}{cfg['leagues']}", max_pages=1, sport_slug=slug)
    leagues = filter_target_leagues(slug, leagues)
    leagues = select_diverse_leagues(leagues, max_leagues=max_leagues)
    print(f"Leagues fetched: {len(leagues)}")

    for league in leagues:
        parsed = extract_league_fields(league)
        if not parsed:
            continue

        api_league_id = parsed.get('id')
        league_name = parsed.get('name')
        country = parsed.get('country')
        seasons = parsed.get('seasons') or []
        season = pick_latest_season(seasons, fallback=2024)

        if not league_name:
            continue

        safe_api_league_id = int(api_league_id) if api_league_id else abs(hash(f'{slug}:{league_name}')) % 1000000000
        league_id = upsert_league(sport_id, slug, safe_api_league_id, str(league_name), country, int(season))

        if not cfg.get('teams'):
            print(f"  League {league_name}: teams endpoint not configured for {slug}, skipping teams/players")
            continue

        if api_league_id is None:
            print(f"  League {league_name}: missing league id for {slug}, skipping teams/players")
            continue

        team_params = {'league': api_league_id}
        if cfg.get('season_param'):
            team_params[cfg['season_param']] = season

        teams = fetch_api_sports(
            f"{base}{cfg['teams']}",
            params=team_params,
            max_pages=1,
            sport_slug=slug,
        )
        teams = teams[:max_teams]
        print(f"  League {league_name}: teams fetched={len(teams)}")

        for team_wrapper in teams:
            team_obj = team_wrapper.get('team') or team_wrapper
            api_team_id = team_obj.get('id')
            if not api_team_id:
                continue

            team_id = upsert_team(
                league_id,
                int(api_team_id),
                str(team_obj.get('name', f'team-{api_team_id}')),
                team_obj.get('country'),
                team_obj.get('logo') or '',
                sport_key=slug,
            )

            if not include_players or not cfg.get('players'):
                continue

            try:
                players_raw = fetch_api_sports(f"{base}{cfg['players']}", params={'team': api_team_id}, max_pages=1, sport_slug=slug)
            except Exception as exc:
                print(f"    Players fetch failed for team {team_obj.get('name')}: {exc}")
                continue
            if slug == 'football':
                players = (players_raw[0].get('players') if players_raw else []) or []
            else:
                players = players_raw

            players = players[:max_players]
            for p in players:
                pid = p.get('id')
                if not pid:
                    continue
                first = p.get('firstname') or ''
                last = p.get('lastname') or p.get('name') or ''
                full_name = (f"{first} {last}").strip() or f"player-{pid}"
                upsert_player(
                    team_id,
                    int(pid),
                    full_name,
                    p.get('age'),
                    p.get('number'),
                    p.get('position'),
                    p.get('photo') or '',
                )

    print(f"Finished {slug}")


def probe_other_apis() -> None:
    try:
        odds_resp = requests.get(
            'https://api.the-odds-api.com/v4/sports',
            params={'apiKey': ODDS_API_KEY},
            timeout=20,
        )
        print(f"ODDS_API probe status={odds_resp.status_code}")
    except Exception as exc:
        print(f"ODDS_API probe failed: {exc}")

    try:
        cricket_resp = requests.get(
            'https://api.cricapi.com/v1/currentMatches',
            params={'apikey': CRICKETDATA_API_KEY, 'offset': 0},
            timeout=20,
        )
        print(f"CRICKETDATA probe status={cricket_resp.status_code}")
    except Exception as exc:
        print(f"CRICKETDATA probe failed: {exc}")


def main() -> None:
    print('Starting data ingestion with configured environment keys...')
    print('Using key names: RAPIDAPI_KEY, X_APISPORTS_KEY, ODDS_API_KEY, X_RAPIDAPI_KEY, CRICKETDATA_API_KEY')
    print('Daily-limit mode: leagues+teams prioritized, players disabled by default')

    args = [a.lower().strip() for a in sys.argv[1:]]
    include_players = DEFAULT_INCLUDE_PLAYERS
    arg = 'all'

    for a in args:
        if a == '--with-players':
            include_players = True
            continue
        arg = a

    if arg == 'all':
        target_sports = list(SPORT_CONFIG.keys())
    elif arg in SPORT_CONFIG:
        target_sports = [arg]
    else:
        allowed = ', '.join(['all'] + list(SPORT_CONFIG.keys()))
        sys.exit(f'Usage: python populate_sports_data.py <{allowed}> [--with-players]')

    for sport in target_sports:
        try:
            import_sport(
                sport,
                max_leagues=DEFAULT_MAX_LEAGUES,
                max_teams=DEFAULT_MAX_TEAMS,
                max_players=DEFAULT_MAX_PLAYERS,
                include_players=include_players,
            )
        except Exception as exc:
            print(f'Import failed for {sport}: {exc}')

    probe_other_apis()
    print('Ingestion complete.')


if __name__ == '__main__':
    main()
