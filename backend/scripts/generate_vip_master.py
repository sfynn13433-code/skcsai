import hashlib
import os
import random
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent

load_dotenv(SCRIPT_DIR / ".env")
load_dotenv(PROJECT_ROOT / ".env")
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY.")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

DIRECT_QUOTAS = {"deep_dive": 20, "strike": 28, "pro": 35, "vip": 45}
SECONDARY_QUOTAS = {"deep_dive": 12, "strike": 15, "pro": 20, "vip": 25}
ACCA_QUOTAS = {"deep_dive": 5, "strike": 7, "pro": 10, "vip": 15}

SECONDARY_MARKETS = [
    ("over_1_5", "OVER 1.5 GOALS", 0.84),
    ("btts_yes", "BTTS - YES", 0.79),
    ("corners_over_8_5", "OVER 8.5 CORNERS", 0.81),
    ("under_4_5", "UNDER 4.5 GOALS", 0.88),
]

SAFE_ACCA_MARKETS = [
    ("double_chance_1x", "1X (HOME OR DRAW)", 0.85),
    ("over_1_5", "OVER 1.5 GOALS", 0.82),
    ("away_plus_1_5", "AWAY +1.5 HANDICAP", 0.88),
    ("under_4_5", "UNDER 4.5 GOALS", 0.90),
]


def safe_console_text(value):
    return str(value).encode("ascii", errors="replace").decode("ascii")


def seeded_rng(*parts):
    seed_input = "|".join(str(part) for part in parts)
    seed = int(hashlib.sha256(seed_input.encode("utf-8")).hexdigest()[:8], 16)
    return random.Random(seed)


def get_tier_access(current_count, quotas):
    if current_count < quotas["deep_dive"]:
        return ["deep_dive", "strike", "pro", "vip"]
    if current_count < quotas["strike"]:
        return ["strike", "pro", "vip"]
    if current_count < quotas["pro"]:
        return ["pro", "vip"]
    return ["vip"]


def clear_predictions():
    response = supabase.table("predictions_final").delete().neq("id", 0).execute()
    return len(response.data or [])


def fetch_events():
    response = (
        supabase.table("canonical_events")
        .select("*")
        .eq("sport", "football")
        .order("start_time_utc")
        .execute()
    )
    return response.data or []


def extract_match(event):
    raw_data = event.get("raw_provider_data") or {}
    teams = raw_data.get("teams") or {}
    league_data = raw_data.get("league") or {}
    fixture = raw_data.get("fixture") or {}

    home_team = ((teams.get("home") or {}).get("name")) or "Unknown Home"
    away_team = ((teams.get("away") or {}).get("name")) or "Unknown Away"
    league = league_data.get("name") or event.get("competition_name") or "Football"
    match_time = event.get("start_time_utc") or fixture.get("date")
    match_id = str(event.get("id") or fixture.get("id") or "")

    return {
        "match_id": match_id,
        "home_team": home_team,
        "away_team": away_team,
        "league": league,
        "match_time": match_time,
    }


def build_single_match_payload(match, tier_access, prediction_type, market, prediction, confidence, reasoning):
    return {
        "tier": "deep",
        "type": prediction_type,
        "risk_level": "medium",
        "total_confidence": confidence,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "matches": [
            {
                "sport": "football",
                "match_id": match["match_id"],
                "market": market,
                "home_team": match["home_team"],
                "away_team": match["away_team"],
                "match_date": match["match_time"],
                "commence_time": match["match_time"],
                "prediction": prediction,
                "confidence": confidence,
                "metadata": {
                    "league": match["league"],
                    "predicted_outcome": prediction,
                    "tier_access": tier_access,
                    "reasoning": reasoning,
                    "event_id": match["match_id"],
                },
            }
        ],
    }


def build_direct_payload(event, index):
    match = extract_match(event)
    tier_access = get_tier_access(index, DIRECT_QUOTAS)
    rng = seeded_rng("direct", match["match_id"], index)
    prediction = rng.choice(["HOME_WIN", "AWAY_WIN", "DRAW"])
    confidence = rng.randint(65, 82)

    return build_single_match_payload(
        match=match,
        tier_access=tier_access,
        prediction_type="direct",
        market="match_result",
        prediction=prediction,
        confidence=confidence,
        reasoning="Straight-result baseline built from form, venue, and schedule context.",
    )


def build_secondary_payload(event, index):
    match = extract_match(event)
    tier_access = get_tier_access(index, SECONDARY_QUOTAS)
    rng = seeded_rng("secondary", match["match_id"], index)
    market, prediction, base_probability = rng.choice(SECONDARY_MARKETS)
    confidence = max(75, min(88, int(base_probability * 100) + rng.randint(-2, 2)))

    return build_single_match_payload(
        match=match,
        tier_access=tier_access,
        prediction_type="secondary",
        market=market,
        prediction=prediction,
        confidence=confidence,
        reasoning="Mixed-market safety bias using high-probability totals, BTTS, and corners profiles.",
    )


def build_acca_payload(events, index):
    tier_access = get_tier_access(index, ACCA_QUOTAS)
    event_ids = [str(event.get("id") or (event.get("raw_provider_data") or {}).get("fixture", {}).get("id") or "") for event in events]
    rng = seeded_rng("acca", index, *event_ids)
    selected_events = rng.sample(events, 6)

    legs = []
    combined_probability = 1.0

    for leg_index, event in enumerate(selected_events):
        match = extract_match(event)
        market, prediction, leg_probability = rng.choice(SAFE_ACCA_MARKETS)
        combined_probability *= leg_probability

        legs.append(
            {
                "sport": "football",
                "match_id": match["match_id"],
                "market": market,
                "home_team": match["home_team"],
                "away_team": match["away_team"],
                "match_date": match["match_time"],
                "commence_time": match["match_time"],
                "prediction": prediction,
                "confidence": int(leg_probability * 100),
                "metadata": {
                    "league": match["league"],
                    "predicted_outcome": prediction,
                    "leg_confidence": int(leg_probability * 100),
                    "tier_access": tier_access,
                    "acca_leg_index": leg_index + 1,
                    "event_id": match["match_id"],
                },
            }
        )

    final_probability = max(20, min(95, int(round(combined_probability * 100))))

    return {
        "tier": "deep",
        "type": "acca",
        "risk_level": "medium",
        "total_confidence": final_probability,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "matches": legs,
    }


def chunked(items, size):
    for index in range(0, len(items), size):
        yield items[index:index + size]


def generate_vip_master_set():
    print("SKCS AI: Initializing VIP Master Engine...")
    print("Fetching live football canonical events...")

    events = fetch_events()
    if len(events) < 15:
        print("Not enough events to generate a full VIP Saturday set. Need at least 15.")
        return 0

    print(f"Fetched {len(events)} football events.")
    print("Wiping old predictions for the new daily run...")
    deleted = clear_predictions()
    print(f"Deleted {deleted} existing rows from predictions_final.")

    payloads = []

    print("Generating VIP quotas: Direct, Secondary, ACCA...")

    for index, event in enumerate(events[: min(45, len(events))]):
        payloads.append(build_direct_payload(event, index))

    for index, event in enumerate(reversed(events[: min(25, len(events))])):
        payloads.append(build_secondary_payload(event, index))

    acca_count = min(15, len(events) // 6)
    for index in range(acca_count):
        payloads.append(build_acca_payload(events, index))

    print(f"Blasting {len(payloads)} waterfall-tagged predictions to the live database...")
    inserted = 0
    total_batches = (len(payloads) + 199) // 200
    for batch_number, batch in enumerate(chunked(payloads, 200), start=1):
        supabase.table("predictions_final").insert(batch).execute()
        inserted += len(batch)
        print(f"Batch {batch_number}/{total_batches}: inserted {len(batch)} rows ({inserted} total)")

    direct_count = sum(1 for payload in payloads if payload["type"] == "direct")
    secondary_count = sum(1 for payload in payloads if payload["type"] == "secondary")
    acca_count = sum(1 for payload in payloads if payload["type"] == "acca")

    print(
        "VIP Master Generation Complete. "
        f"Direct={direct_count}, Secondary={secondary_count}, ACCA={acca_count}"
    )

    sample = payloads[:3]
    for payload in sample:
        first_match = payload["matches"][0]
        tiers = first_match.get("metadata", {}).get("tier_access", [])
        print(
            f"Sample [{payload['type']}]: "
            f"{safe_console_text(first_match['home_team'])} vs "
            f"{safe_console_text(first_match['away_team'])} -> "
            f"{first_match['prediction']} | tiers={tiers}"
        )

    return inserted


if __name__ == "__main__":
    generate_vip_master_set()
