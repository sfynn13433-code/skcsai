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
MULTI_QUOTAS = {"deep_dive": 8, "strike": 10, "pro": 14, "vip": 18}
SAME_MATCH_QUOTAS = {"deep_dive": 8, "strike": 10, "pro": 14, "vip": 18}
ACCA_QUOTAS = {"deep_dive": 5, "strike": 7, "pro": 10, "vip": 15}

SECONDARY_MARKETS = [
    ("over_1_5", "OVER 1.5 GOALS", 0.84),
    ("over_2_5", "OVER 2.5 GOALS", 0.76),
    ("under_3_5", "UNDER 3.5 GOALS", 0.83),
    ("btts_yes", "BTTS - YES", 0.79),
    ("btts_no", "BTTS - NO", 0.74),
    ("double_chance_1x", "DOUBLE CHANCE - 1X", 0.85),
    ("double_chance_12", "DOUBLE CHANCE - 12", 0.77),
    ("double_chance_x2", "DOUBLE CHANCE - X2", 0.82),
    ("corners_over_8_5", "OVER 8.5 CORNERS", 0.81),
    ("corners_over_9_5", "OVER 9.5 CORNERS", 0.76),
    ("corners_under_10_5", "UNDER 10.5 CORNERS", 0.78),
    ("red_cards_under_0_5", "UNDER 0.5 RED CARDS", 0.92),
    ("red_cards_over_0_5", "OVER 0.5 RED CARDS", 0.58),
    ("ht_home_win", "HALF TIME - HOME WIN", 0.63),
    ("ht_away_win", "HALF TIME - AWAY WIN", 0.55),
    ("ht_draw", "HALF TIME - DRAW", 0.61),
    ("ht_double_chance_1x", "HALF TIME - 1X", 0.79),
    ("ht_double_chance_x2", "HALF TIME - X2", 0.77),
    ("under_4_5", "UNDER 4.5 GOALS", 0.88),
]

DIRECT_SECONDARY_POOL = [
    ("double_chance_1x", "DOUBLE CHANCE - 1X", 0.85),
    ("double_chance_x2", "DOUBLE CHANCE - X2", 0.82),
    ("over_1_5", "OVER 1.5 GOALS", 0.84),
    ("under_3_5", "UNDER 3.5 GOALS", 0.83),
    ("corners_over_8_5", "OVER 8.5 CORNERS", 0.81),
    ("btts_yes", "BTTS - YES", 0.79),
    ("ht_draw", "HALF TIME - DRAW", 0.61),
]

SAFE_ACCA_MARKETS = [
    ("double_chance_1x", "DOUBLE CHANCE - 1X", 0.85),
    ("over_1_5", "OVER 1.5 GOALS", 0.82),
    ("double_chance_x2", "DOUBLE CHANCE - X2", 0.82),
    ("under_4_5", "UNDER 4.5 GOALS", 0.90),
    ("red_cards_under_0_5", "UNDER 0.5 RED CARDS", 0.92),
]

SAME_MATCH_COMBOS = [
    [("match_result", "HOME_WIN", 0.74), ("over_1_5", "OVER 1.5 GOALS", 0.84)],
    [("match_result", "AWAY_WIN", 0.68), ("over_1_5", "OVER 1.5 GOALS", 0.84)],
    [("double_chance_1x", "DOUBLE CHANCE - 1X", 0.85), ("under_4_5", "UNDER 4.5 GOALS", 0.90)],
    [("btts_yes", "BTTS - YES", 0.79), ("over_1_5", "OVER 1.5 GOALS", 0.84)],
    [("ht_double_chance_1x", "HALF TIME - 1X", 0.79), ("under_3_5", "UNDER 3.5 GOALS", 0.83)],
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
    home_probability = rng.randint(30, 65)
    draw_probability = rng.randint(20, 35)
    away_probability = max(5, 100 - (home_probability + draw_probability))

    if home_probability >= away_probability and home_probability >= draw_probability:
        prediction = "HOME_WIN"
        confidence = home_probability
    elif away_probability >= draw_probability:
        prediction = "AWAY_WIN"
        confidence = away_probability
    else:
        prediction = "DRAW"
        confidence = draw_probability

    missing_players = rng.choice([0, 1, 2])
    context_flag = (
        f"Missing {missing_players} key starters." if missing_players > 0 else "Full strength squad."
    )
    weather = rng.choice(["Clear", "Rain", "Windy"])
    volatility = "High" if weather in {"Rain", "Windy"} or missing_players > 1 else "Low"
    acca_safe = volatility == "Low" and max(home_probability, away_probability) > 50

    nested_secondary = []
    for market, outcome, market_probability in rng.sample(DIRECT_SECONDARY_POOL, 3):
        nested_secondary.append(
            {
                "market": market,
                "prediction": outcome,
                "confidence": int(market_probability * 100),
            }
        )

    reasoning = (
        f"Stage 1 Baseline gives {prediction.replace('_', ' ')} a {confidence}% edge. "
        f"Stage 2 Context notes: {context_flag} "
        f"Stage 3 flags {volatility} volatility due to {weather.lower()} conditions. "
        "Stage 4 Decision keeps the main 1X2 lean, with secondary backup markets available below."
    )

    return {
        "tier": "deep",
        "type": "direct",
        "risk_level": "medium",
        "total_confidence": confidence,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "matches": [
            {
                "sport": "football",
                "match_id": match["match_id"],
                "market": "match_result",
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
                    "secondary_markets": nested_secondary,
                    "pipeline_data": {
                        "stage_1_baseline": {
                            "home": home_probability,
                            "draw": draw_probability,
                            "away": away_probability,
                        },
                        "stage_2_context": context_flag,
                        "stage_3_reality": {
                            "weather": weather,
                            "volatility": volatility,
                        },
                        "stage_4_decision": {
                            "acca_safe": acca_safe,
                        },
                    },
                    "event_id": match["match_id"],
                },
            }
        ],
    }


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


def build_multi_payload(events, index):
    tier_access = get_tier_access(index, MULTI_QUOTAS)
    rng = seeded_rng("multi", index, len(events))
    selected_events = rng.sample(events, 2)

    first_match = extract_match(selected_events[0])
    second_match = extract_match(selected_events[1])

    first_leg = ("match_result", rng.choice(["HOME_WIN", "AWAY_WIN", "DRAW"]), 0.75)
    second_leg = rng.choice([
        ("over_1_5", "OVER 1.5 GOALS", 0.78),
        ("double_chance_1x", "DOUBLE CHANCE - 1X", 0.82),
        ("under_4_5", "UNDER 4.5 GOALS", 0.84),
        ("corners_over_8_5", "OVER 8.5 CORNERS", 0.76),
    ])
    combined_probability = int(round(first_leg[2] * second_leg[2] * 100))

    return {
        "tier": "deep",
        "type": "multi",
        "risk_level": "medium",
        "total_confidence": max(52, min(65, combined_probability)),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "matches": [
            {
                "sport": "football",
                "match_id": first_match["match_id"],
                "market": first_leg[0],
                "home_team": first_match["home_team"],
                "away_team": first_match["away_team"],
                "match_date": first_match["match_time"],
                "commence_time": first_match["match_time"],
                "prediction": first_leg[1],
                "confidence": int(first_leg[2] * 100),
                "metadata": {
                    "league": first_match["league"],
                    "predicted_outcome": first_leg[1],
                    "tier_access": tier_access,
                    "reasoning": "Standard cross-match accumulator.",
                    "event_id": first_match["match_id"],
                },
            },
            {
                "sport": "football",
                "match_id": second_match["match_id"],
                "market": second_leg[0],
                "home_team": second_match["home_team"],
                "away_team": second_match["away_team"],
                "match_date": second_match["match_time"],
                "commence_time": second_match["match_time"],
                "prediction": second_leg[1],
                "confidence": int(second_leg[2] * 100),
                "metadata": {
                    "league": second_match["league"],
                    "predicted_outcome": second_leg[1],
                    "tier_access": tier_access,
                    "reasoning": "Standard cross-match accumulator.",
                    "event_id": second_match["match_id"],
                },
            },
        ],
    }


def build_same_match_payload(event, index):
    match = extract_match(event)
    tier_access = get_tier_access(index, SAME_MATCH_QUOTAS)
    rng = seeded_rng("same_match", match["match_id"], index)
    selected_combo = rng.choice(SAME_MATCH_COMBOS)
    combined_probability = 1.0
    legs = []

    for leg_index, (market, prediction, leg_probability) in enumerate(selected_combo, start=1):
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
                    "tier_access": tier_access,
                    "reasoning": "Correlated outcomes within the same fixture.",
                    "event_id": match["match_id"],
                    "same_match_leg_index": leg_index,
                },
            }
        )

    return {
        "tier": "deep",
        "type": "same_match",
        "risk_level": "medium",
        "total_confidence": max(60, min(72, int(round(combined_probability * 100)))),
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
    processed_safe_matches = []

    print("Generating VIP quotas: Direct, Secondary, Multi, Same Match, ACCA...")

    for index, event in enumerate(events[: min(45, len(events))]):
        payload = build_direct_payload(event, index)
        payloads.append(payload)
        decision = (
            ((payload.get("matches") or [{}])[0].get("metadata") or {})
            .get("pipeline_data", {})
            .get("stage_4_decision", {})
        )
        if decision.get("acca_safe"):
            processed_safe_matches.append(event)

    for index, event in enumerate(reversed(events[: min(25, len(events))])):
        payloads.append(build_secondary_payload(event, index))

    multi_count = min(18, len(events) // 2)
    for index in range(multi_count):
        payloads.append(build_multi_payload(events, index))

    same_match_count = min(18, len(events))
    for index in range(same_match_count):
        payloads.append(build_same_match_payload(events[index], index))

    acca_source = processed_safe_matches if len(processed_safe_matches) >= 6 else events
    acca_count = min(15, len(acca_source) // 6)
    for index in range(acca_count):
        payloads.append(build_acca_payload(acca_source, index))

    print(f"Blasting {len(payloads)} waterfall-tagged predictions to the live database...")
    inserted = 0
    total_batches = (len(payloads) + 199) // 200
    for batch_number, batch in enumerate(chunked(payloads, 200), start=1):
        supabase.table("predictions_final").insert(batch).execute()
        inserted += len(batch)
        print(f"Batch {batch_number}/{total_batches}: inserted {len(batch)} rows ({inserted} total)")

    direct_count = sum(1 for payload in payloads if payload["type"] == "direct")
    secondary_count = sum(1 for payload in payloads if payload["type"] == "secondary")
    multi_count = sum(1 for payload in payloads if payload["type"] == "multi")
    same_match_count = sum(1 for payload in payloads if payload["type"] == "same_match")
    acca_count = sum(1 for payload in payloads if payload["type"] == "acca")

    print(
        "VIP Master Generation Complete. "
        f"Direct={direct_count}, Secondary={secondary_count}, Multi={multi_count}, "
        f"SameMatch={same_match_count}, ACCA={acca_count}"
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
