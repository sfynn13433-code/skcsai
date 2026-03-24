#!/usr/bin/env python3
"""
populate_sports_data.py
-----------------------
A minimal, step‑by‑step script that loads real data from API‑SPORTS
into a Supabase database.

Supported sports (add more by extending SPORT_CONFIG):
    football   →  https://v3.football.api-sports.io
    basketball →  https://v2.nba.api-sports.io   (NBA specific)
    rugby      →  https://v3.rugby.api-sports.io
    afl        →  https://v3.afl.api-sports.io
    baseball   →  https://v3.baseball.api-sports.io
    (etc – follow the same pattern: https://vX.<sport>.api-sports.io)

Author:  your‑name
"""

import os
import sys
import time
from typing import Dict, List, Any

import requests
from supabase import create_client, Client
from dotenv import load_dotenv

# -------------------------------------------------------------------------
# 1️⃣  Load env vars
# -------------------------------------------------------------------------
load_dotenv()                         # reads .env in project root
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY")   # use service_role_key if you need upserts
APISPORSTS_KEY = os.getenv("APISPORSTS_KEY")

if not all([SUPABASE_URL, SUPABASE_KEY, APISPORSTS_KEY]):
    sys.exit("❌  Missing one of SUPABASE_URL, SUPABASE_ANON_KEY or APISPORSTS_KEY in .env")

# -------------------------------------------------------------------------
# 2️⃣  Initialise Supabase client
# -------------------------------------------------------------------------
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# -------------------------------------------------------------------------
# 3️⃣  Mapping of sport → base URL and endpoint quirks
# -------------------------------------------------------------------------
SPORT_CONFIG = {
    "football": {
        "base": "https://v3.football.api-sports.io",
        "leagues": "/leagues",
        "teams": "/teams",                 # requires league + season
        "players": "/players/squads",        # team param
        "season_param": "season",          # same name for all sports
    },
    "basketball": {
        "base": "https://v2.nba.api-sports.io",
        "leagues": "/leagues",              # NBA has a single “NBA” league but we keep the same pattern
        "teams": "/teams",
        "players": "/players",             # NBA only exposes individual player endpoint; we’ll use it
        "season_param": "season",
    },
    # Add other sports here – most follow the same pattern
    "rugby": {"base": "https://v3.rugby.api-sports.io", "leagues": "/leagues",
              "teams": "/teams", "players": "/players/squads", "season_param": "season"},
    # …
}

HEADERS = {"x-apisports-key": APISPORSTS_KEY}

# -------------------------------------------------------------------------
# 4️⃣  Helper functions to hit API‑SPORTS (with pagination)
# -------------------------------------------------------------------------
def fetch_endpoint(url: str, params: Dict[str, Any] = None) -> List[Dict]:
    """
    Calls an API‑SPORTS endpoint, follows pagination (if present) and returns
    a flat list of all `response` objects.
    """
    all_items = []
    page = 1
    while True:
        p = dict(params or {})
        p["page"] = page
        r = requests.get(url, headers=HEADERS, params=p)
        if r.status_code != 200:
            raise RuntimeError(f"👎  API error {r.status_code}: {r.text}")

        data = r.json()
        # API‑SPORTS always wraps data in a top‑level `response` list
        all_items.extend(data.get("response", []))

        paging = data.get("paging", {})
        if not paging or paging.get("current") >= paging.get("total", 1):
            break
        page += 1
        time.sleep(0.2)   # be friendly to the free‑plan rate limits
    return all_items


# -------------------------------------------------------------------------
# 5️⃣  Upsert helpers (Supabase `upsert` = insert or replace on conflict)
# -------------------------------------------------------------------------
def upsert_sport(slug: str, name: str) -> int:
    """Return the internal PK of the sport row (creates if missing)."""
    resp = supabase.table("sports").upsert(
        {"slug": slug, "name": name}, on_conflict="slug"
    ).execute()
    # fetch the row to get its id
    row = supabase.table("sports").select("id").eq("slug", slug).single().execute()
    return row.data["id"]


def upsert_league(sport_id: int, api_id: int, name: str, country: str, season: int) -> int:
    resp = supabase.table("leagues").upsert(
        {
            "api_id": api_id,
            "sport_id": sport_id,
            "name": name,
            "country": country,
            "season": season,
        },
        on_conflict="api_id,sport_id",
    ).execute()
    # return PK
    row = (
        supabase.table("leagues")
        .select("id")
        .eq("api_id", api_id)
        .eq("sport_id", sport_id)
        .single()
        .execute()
    )
    return row.data["id"]


def upsert_team(league_id: int, api_id: int, name: str, country: str, logo: str) -> int:
    resp = supabase.table("teams").upsert(
        {
            "api_id": api_id,
            "league_id": league_id,
            "name": name,
            "country": country,
            "logo": logo,
        },
        on_conflict="api_id,league_id",
    ).execute()
    row = (
        supabase.table("teams")
        .select("id")
        .eq("api_id", api_id)
        .eq("league_id", league_id)
        .single()
        .execute()
    )
    return row.data["id"]


def upsert_player(
    team_id: int,
    api_id: int,
    name: str,
    age: int | None,
    number: int | None,
    position: str | None,
    photo: str | None,
) -> None:
    supabase.table("players").upsert(
        {
            "api_id": api_id,
            "team_id": team_id,
            "name": name,
            "age": age,
            "number": number,
            "position": position,
            "photo": photo,
        },
        on_conflict="api_id,team_id",
    ).execute()


# -------------------------------------------------------------------------
# 6️⃣  Core import logic – one sport at a time
# -------------------------------------------------------------------------
def import_sport(sport_slug: str) -> None:
    if sport_slug not in SPORT_CONFIG:
        raise ValueError(f"⚠️ Unknown sport {sport_slug!r}")

    cfg = SPORT_CONFIG[sport_slug]
    base = cfg["base"]
    print(f"\n🚀  Starting import for **{sport_slug}** (base: {base})")

    # ---- 6.1  Sports table (once) -----------------------------------------
    sport_id = upsert_sport(sport_slug, sport_slug.title())
    print(f"   → sport row id = {sport_id}")

    # ---- 6.2  Leagues -------------------------------------------------------
    leagues_url = f"{base}{cfg['leagues']}"
    raw_leagues = fetch_endpoint(leagues_url)
    print(f"   📚  {len(raw_leagues)} league objects returned")

    for league in raw_leagues:
        # API‑FOOTBALL gives you a list of seasons in a sub‑object → pick the latest
        # Example response shape for football: {"league":{"id":39,"name":"Premier League","country":"England","seasons":[2023,2022,…]}}
        league_info = league["league"]
        api_id = league_info["id"]
        name = league_info["name"]
        country = league_info.get("country")
        seasons = league_info.get("seasons", [])
        season = max(seasons) if seasons else None   # most recent

        if season is None:
            # Some sports (e.g., some cups) may not have a season – skip them
            continue

        league_id = upsert_league(sport_id, api_id, name, country, season)

        # ---- 6.3  Teams ----------------------------------------------------
        teams_url = f"{base}{cfg['teams']}"
        team_params = {"league": api_id, cfg["season_param"]: season}
        raw_teams = fetch_endpoint(teams_url, team_params)
        print(f"      🏟️  {len(raw_teams)} teams for league {name} ({season})")

        for team_wrapper in raw_teams:
            # For football the response item is {"team":{…},"venue":{…}}
            # For NBA the response item is just the team object.
            team_obj = team_wrapper.get("team") or team_wrapper
            api_team_id = team_obj["id"]
            team_name = team_obj["name"]
            team_country = team_obj.get("country")
            logo = team_obj.get("logo") or ""

            team_id = upsert_team(league_id, api_team_id, team_name, team_country, logo)

            # ---- 6.4  Players (squad) -----------------------------------------
            # Football (soccer) uses /players/squads?team=ID
            # NBA uses /players?id=TEAM_ID?  – we must call the generic endpoint and filter on `team`.
            players_url = f"{base}{cfg['players']}"
            player_params = {"team": api_team_id}
            raw_players = fetch_endpoint(players_url, player_params)

            # For football the key is `players`; for NBA it is just a flat list.
            player_items = raw_players[0].get("players") if sport_slug == "football" else raw_players

            for p in player_items:
                p_id = p["id"]
                p_name = f"{p.get('firstname','')}{' ' if p.get('firstname') else ''}{p.get('lastname','')}".strip()
                # Fields vary by sport – we guard with .get()
                age = p.get("age")
                number = p.get("number")
                position = p.get("position")
                photo = p.get("photo") or ""
                upsert_player(team_id, p_id, p_name, age, number, position, photo)

    print(f"✅  Done importing {sport_slug}! 🎉")


# -------------------------------------------------------------------------
# 7️⃣  CLI entry point
# -------------------------------------------------------------------------
if __name__ == "__main__":
    # Simple CLI: `python populate_sports_data.py football` or `all`
    if len(sys.argv) < 2:
        sys.exit("Usage: populate_sports_data.py <sport_slug|all>")
    arg = sys.argv[1].lower()
    if arg == "all":
        for s in SPORT_CONFIG.keys():
            import_sport(s)
    else:
        import_sport(arg)
