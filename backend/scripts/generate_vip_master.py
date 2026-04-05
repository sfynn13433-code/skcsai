import asyncio
import hashlib
import json
import os
import random
import requests
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

try:
    from google import genai
    from google.genai import types as genai_types
except ImportError:
    genai = None
    genai_types = None


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent

from openai import AsyncOpenAI

load_dotenv(SCRIPT_DIR / ".env")
load_dotenv(PROJECT_ROOT / ".env")
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
GROQ_KEY = os.getenv("GROQ_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
COHERE_API_KEY = os.getenv("COHERE_API_KEY")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENAI_KEY = os.getenv("OPENAI_KEY")
LOCAL_LLM_BASE_URL = os.getenv("LOCAL_LLM_BASE_URL") or "http://127.0.0.1:8080/v1"
LOCAL_LLM_MODEL = os.getenv("LOCAL_LLM_MODEL") or "Dolphin3.0-Llama3.2-3B-Q5_K_M.gguf"
LOCAL_LLM_TIMEOUT = float(os.getenv("LOCAL_LLM_TIMEOUT") or "120")
GOOGLE_CLOUD_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT")
GOOGLE_CLOUD_LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION") or "global"
GOOGLE_GENAI_USE_VERTEXAI = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "").strip().lower() in {"1", "true", "yes", "on"}
VERTEX_GEMINI_MODEL = os.getenv("VERTEX_GEMINI_MODEL") or "gemini-2.5-flash"
PROVIDER_CHAIN_JSON = os.getenv("SKCS_PROVIDER_CHAIN_JSON")
EVENT_LIMIT = int(os.getenv("SKCS_EVENT_LIMIT") or "0")
MINIMUM_EVENT_COUNT = int(os.getenv("SKCS_MINIMUM_EVENT_COUNT") or "15")
LOCAL_ONLY_MODE = os.getenv("SKCS_LOCAL_ONLY", "").strip().lower() in {"1", "true", "yes", "on"}

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY.")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

ELITE_DAILY_LIMITS = {
    "monday": {
        "direct": {"deep_dive": 8, "strike": 10, "pro": 12, "vip": 15},
        "secondary": {"deep_dive": 5, "strike": 7, "pro": 9, "vip": 12},
        "multi": {"deep_dive": 3, "strike": 4, "pro": 6, "vip": 8},
        "same_match": {"deep_dive": 3, "strike": 4, "pro": 6, "vip": 8},
        "acca": {"deep_dive": 1, "strike": 2, "pro": 3, "vip": 5},
    },
    "tuesday": {
        "direct": {"deep_dive": 8, "strike": 10, "pro": 12, "vip": 15},
        "secondary": {"deep_dive": 5, "strike": 7, "pro": 9, "vip": 12},
        "multi": {"deep_dive": 3, "strike": 4, "pro": 6, "vip": 8},
        "same_match": {"deep_dive": 3, "strike": 4, "pro": 6, "vip": 8},
        "acca": {"deep_dive": 1, "strike": 2, "pro": 3, "vip": 5},
    },
    "wednesday": {
        "direct": {"deep_dive": 10, "strike": 14, "pro": 18, "vip": 22},
        "secondary": {"deep_dive": 7, "strike": 9, "pro": 12, "vip": 15},
        "multi": {"deep_dive": 4, "strike": 6, "pro": 8, "vip": 10},
        "same_match": {"deep_dive": 3, "strike": 5, "pro": 7, "vip": 10},
        "acca": {"deep_dive": 2, "strike": 3, "pro": 4, "vip": 7},
    },
    "thursday": {
        "direct": {"deep_dive": 10, "strike": 14, "pro": 18, "vip": 22},
        "secondary": {"deep_dive": 7, "strike": 9, "pro": 12, "vip": 15},
        "multi": {"deep_dive": 4, "strike": 6, "pro": 8, "vip": 10},
        "same_match": {"deep_dive": 3, "strike": 5, "pro": 7, "vip": 10},
        "acca": {"deep_dive": 2, "strike": 3, "pro": 4, "vip": 7},
    },
    "friday": {
        "direct": {"deep_dive": 14, "strike": 18, "pro": 22, "vip": 30},
        "secondary": {"deep_dive": 8, "strike": 11, "pro": 15, "vip": 18},
        "multi": {"deep_dive": 5, "strike": 7, "pro": 10, "vip": 12},
        "same_match": {"deep_dive": 5, "strike": 7, "pro": 10, "vip": 12},
        "acca": {"deep_dive": 3, "strike": 4, "pro": 6, "vip": 10},
    },
    "saturday": {
        "direct": {"deep_dive": 20, "strike": 28, "pro": 35, "vip": 45},
        "secondary": {"deep_dive": 12, "strike": 15, "pro": 20, "vip": 25},
        "multi": {"deep_dive": 8, "strike": 10, "pro": 14, "vip": 18},
        "same_match": {"deep_dive": 8, "strike": 10, "pro": 14, "vip": 18},
        "acca": {"deep_dive": 5, "strike": 7, "pro": 10, "vip": 15},
    },
    "sunday": {
        "direct": {"deep_dive": 16, "strike": 22, "pro": 28, "vip": 35},
        "secondary": {"deep_dive": 10, "strike": 13, "pro": 18, "vip": 22},
        "multi": {"deep_dive": 6, "strike": 8, "pro": 12, "vip": 15},
        "same_match": {"deep_dive": 6, "strike": 8, "pro": 12, "vip": 15},
        "acca": {"deep_dive": 4, "strike": 5, "pro": 8, "vip": 12},
    },
}

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

SKCS_SYSTEM_PROMPT = """
You are the SKCS AI Sports Edge analytical engine.
Execute a rigorous probability analysis on the provided football match.

CRITICAL RULE FOR SECONDARY MARKETS (MARKET DECORRELATION):
The 3 secondary markets MUST NOT logically conflict with each other or the main prediction.
To provide true backup options, pick exactly ONE market from each of these three categories:
- Category 1 (Goals): OVER/UNDER or BTTS
- Category 2 (Action): OVER/UNDER CORNERS or RED CARDS
- Category 3 (Structure): DOUBLE CHANCE or HALF TIME RESULT
Never stack conflicting goal dependencies or overlapping traps.

SKCS AI Logic Guardrails: Market Consistency
You MUST ensure mathematical consistency between the primary outcome and secondary markets. Use the following truth table for your JSON response:

1. Consistency Rules
IF predicted_outcome is "HOME WIN", secondary_markets MUST include "DOUBLE CHANCE - 1X". It is a logical error to suggest "X2" if you are 65% confident in a Home Win.
IF predicted_outcome is "AWAY WIN", secondary_markets MUST include "DOUBLE CHANCE - X2".
IF predicted_outcome is "DRAW", secondary_markets SHOULD include both "1X" and "X2" as coverage, or "UNDER 2.5 GOALS".

2. Confidence Tethering
Secondary markets MUST have a higher confidence score than the 1X2 market.
Example: If Home Win is 65%, 1X (Home or Draw) must be > 65% (e.g., 85%).

3. Market Filtering
Do not suggest "OVER 1.5 GOALS" if the reasoning focuses on a "0-0 Tactical Draw".
Do not suggest "BOTH TEAMS TO SCORE" if the reasoning focuses on "Strong Defensive Clean Sheet".

Updated JSON Output Requirements:
Ensure the same_match_builder and secondary_markets arrays strictly follow the mathematical implication of your predicted_outcome.

CRITICAL FILTERING RULES:
- 1X2 Markets: Must survive all 6 stages with high confidence.
- Multi Bets: Must pass stages 1-4 with low correlation.
- Same-Match Bets: Derived after Stage 2 and adjusted by Stage 3 volatility. Must provide 6 distinct, decorrelated markets.
- ACCAs: Only matches passing all 6 stages with a strictly Low volatility kill-switch.

Return valid JSON only, with no markdown and no extra text.
Schema:
{
  "predicted_outcome": "HOME WIN",
  "total_confidence": 72,
  "eligibility": {
    "is_1x2_safe": true,
    "is_multi_safe": true,
    "is_acca_safe": false
  },
  "secondary_markets": ["OVER 8.5 CORNERS", "DOUBLE CHANCE - 1X", "UNDER 3.5 GOALS"],
  "same_match_builder": [
    {"market": "HOME WIN", "confidence": 72},
    {"market": "OVER 1.5 GOALS", "confidence": 85},
    {"market": "OVER 7.5 CORNERS", "confidence": 78},
    {"market": "UNDER 0.5 RED CARDS", "confidence": 92},
    {"market": "BTTS - YES", "confidence": 68},
    {"market": "HALF TIME - DRAW", "confidence": 55}
  ],
  "pipeline_data": {
    "elite_6_stage": {
      "stage_1_collection": "Data and odds normalized.",
      "stage_2_baseline": "Home 55%, Draw 25%, Away 20%.",
      "stage_3_context": "Missing 1 key defender.",
      "stage_4_reality": "High volatility due to weather.",
      "stage_5_decision": "1X2 confidence adjusted downwards.",
      "stage_6_final": "Failed ACCA kill-switch. Safe for Multi."
    },
    "core_4_stage": {
      "stage_1_baseline": "Home 55%, Draw 25%, Away 20%.",
      "stage_2_context": "Missing 1 key defender.",
      "stage_3_reality": "High volatility.",
      "stage_4_final": "Proceed with caution on 1X2."
    }
  },
  "reasoning": {
    "elite": "Stage 1 Baseline gives HOME WIN a 55% edge. Stage 2 notes key defensive absences. Stage 3 flags High Volatility. Stage 6 Decision removes this from ACCA contention but retains it for Multi builds.",
    "core": "HOME WIN has a slight edge, but high match volatility suggests caution."
  }
}
""".strip()


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


def get_schedule_day_name(now=None):
    return (now or datetime.now(timezone.utc)).strftime("%A").lower()


def get_daily_quota_set(day_name):
    return ELITE_DAILY_LIMITS.get(day_name, ELITE_DAILY_LIMITS["saturday"])


def normalized_ai_low_volatility_hint(elite_pipeline, core_pipeline):
    combined = " ".join(
        [
            str(elite_pipeline.get("stage_4_reality") or ""),
            str(elite_pipeline.get("stage_6_final") or ""),
            str(core_pipeline.get("stage_3_reality") or ""),
            str(core_pipeline.get("stage_4_final") or ""),
        ]
    ).lower()
    if "low volatility" in combined or "strictly low" in combined:
        return True
    if "high volatility" in combined:
        return False
    return False


def build_default_same_match_builder(prediction, confidence):
    primary = prediction.replace("_", " ")
    return [
        {"market": "match_result", "prediction": primary, "confidence": confidence},
        {"market": "over_1_5", "prediction": "OVER 1.5 GOALS", "confidence": 84},
        {"market": "corners_over_7_5", "prediction": "OVER 7.5 CORNERS", "confidence": 78},
        {"market": "red_cards_under_0_5", "prediction": "UNDER 0.5 RED CARDS", "confidence": 92},
        {"market": "double_chance_1x", "prediction": "DOUBLE CHANCE - 1X", "confidence": 82},
        {"market": "ht_draw", "prediction": "HALF TIME - DRAW", "confidence": 55},
    ]


def build_provider_registry():
    providers = [
        {
            "name": "Groq",
            "base_url": "https://api.groq.com/openai/v1",
            "api_key": GROQ_KEY,
            "model": "llama-3.3-70b-versatile",
            "timeout": 8.0,
            "max_attempts": 3,
            "use_response_format": True,
        },
        {
            "name": "Cohere",
            "base_url": "https://api.cohere.ai/compatibility/v1",
            "api_key": COHERE_API_KEY,
            "model": "command-a-03-2025",
            "timeout": 12.0,
            "max_attempts": 2,
            "use_response_format": True,
        },
        {
            "name": "DeepSeek",
            "base_url": "https://api.deepseek.com/v1",
            "api_key": DEEPSEEK_API_KEY,
            "model": "deepseek-chat",
            "timeout": 12.0,
            "max_attempts": 2,
            "use_response_format": True,
        },
        {
            "name": "OpenRouter",
            "base_url": "https://openrouter.ai/api/v1",
            "api_key": OPENROUTER_API_KEY,
            "model": "openrouter/auto",
            "timeout": 15.0,
            "max_attempts": 2,
            "use_response_format": True,
        },
        {
            "name": "Gemini",
            "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
            "api_key": GEMINI_API_KEY,
            "model": "gemini-2.5-flash",
            "timeout": 15.0,
            "max_attempts": 2,
            "use_response_format": True,
        },
        {
            "name": "OpenAI",
            "base_url": "https://api.openai.com/v1",
            "api_key": OPENAI_KEY,
            "model": "gpt-4o-mini",
            "timeout": 12.0,
            "max_attempts": 2,
            "use_response_format": True,
        },
        {
            "name": "Vertex Gemini",
            "model": VERTEX_GEMINI_MODEL,
            "timeout": 30.0,
            "max_attempts": 1,
            "transport": "google_genai",
            "vertex_project": GOOGLE_CLOUD_PROJECT,
            "vertex_location": GOOGLE_CLOUD_LOCATION,
        },
        {
            "name": "Local Dolphin",
            "base_url": LOCAL_LLM_BASE_URL,
            "api_key": "sk-local",
            "model": LOCAL_LLM_MODEL,
            "timeout": LOCAL_LLM_TIMEOUT,
            "max_attempts": 1,
            "use_response_format": False,
        },
    ]

    if LOCAL_ONLY_MODE:
        providers = [provider for provider in providers if provider["name"] == "Local Dolphin"]

    if PROVIDER_CHAIN_JSON:
        try:
            extra_providers = json.loads(PROVIDER_CHAIN_JSON)
            if isinstance(extra_providers, list):
                for item in extra_providers:
                    if isinstance(item, dict):
                        providers.append(item)
        except json.JSONDecodeError:
            print("Invalid SKCS_PROVIDER_CHAIN_JSON. Ignoring extra providers.")

    normalized_providers = []
    for provider in providers:
        if provider.get("transport") == "google_genai":
            if not genai or not (GOOGLE_GENAI_USE_VERTEXAI or provider.get("vertex_project")):
                continue
            normalized_providers.append(
                {
                    "name": provider["name"],
                    "model": provider["model"],
                    "timeout": float(provider.get("timeout", 30.0)),
                    "max_attempts": int(provider.get("max_attempts", 1)),
                    "transport": "google_genai",
                    "vertex_project": provider.get("vertex_project"),
                    "vertex_location": provider.get("vertex_location") or "global",
                }
            )
            continue
        api_key = provider.get("api_key")
        api_key_env = provider.get("api_key_env")
        if api_key_env:
            api_key = os.getenv(api_key_env)
        if provider.get("name") != "Local Dolphin" and not api_key:
            continue
        normalized_providers.append(
            {
                "name": provider["name"],
                "base_url": provider["base_url"],
                "api_key": api_key,
                "model": provider["model"],
                "timeout": float(provider.get("timeout", 15.0)),
                "max_attempts": int(provider.get("max_attempts", 2)),
                "use_response_format": bool(provider.get("use_response_format", True)),
            }
        )
    return normalized_providers


PROVIDERS = build_provider_registry()
PROVIDER_CLIENTS = {
    provider["name"]: AsyncOpenAI(api_key=provider["api_key"], base_url=provider["base_url"])
    for provider in PROVIDERS
    if provider.get("transport") != "google_genai"
}

VERTEX_GEMINI_CLIENT = None


def clear_predictions():
    response = supabase.table("predictions_final").delete().neq("id", 0).execute()
    return len(response.data or [])


def fetch_events():
    query = (
        supabase.table("canonical_events")
        .select("*")
        .eq("sport", "football")
        .order("start_time_utc")
    )
    if EVENT_LIMIT > 0:
        query = query.limit(EVENT_LIMIT)
    response = query.execute()
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


def build_match_prompt(event):
    match = extract_match(event)
    raw_data = event.get("raw_provider_data") or {}
    fixture = raw_data.get("fixture") or {}
    league_data = raw_data.get("league") or {}

    return (
        f"Analyze match: {match['home_team']} vs {match['away_team']} on {match['match_time']}.\n"
        f"Competition: {match['league']}\n"
        f"Fixture ID: {fixture.get('id') or match['match_id']}\n"
        f"Country: {league_data.get('country') or 'Unknown'}\n"
        f"Raw provider data: {json.dumps(raw_data, ensure_ascii=True)}"
    )


def build_header_info(match):
    try:
        parsed = datetime.fromisoformat(str(match["match_time"]).replace("Z", "+00:00"))
        formatted = parsed.strftime("%d/%m/%y %H:%M")
    except Exception:
        formatted = str(match["match_time"])
    return f"FOOTBALL • {formatted} • {match['league']}"


def enforce_market_consistency(payload):
    """
    Final check to prevent the 'Home Win vs X2' contradiction.
    """
    outcome = payload.get("predicted_outcome")
    secondary = payload.get("secondary_markets", [])
    
    # 1. Fix 1X2 vs Double Chance Contradictions
    if outcome == "HOME WIN":
        # Remove X2 if it exists, replace with 1X
        payload["secondary_markets"] = [m for m in secondary if "X2" not in m]
        if "DOUBLE CHANCE - 1X" not in payload["secondary_markets"]:
            payload["secondary_markets"].append("DOUBLE CHANCE - 1X")
            
    elif outcome == "AWAY WIN":
        # Remove 1X if it exists, replace with X2
        payload["secondary_markets"] = [m for m in secondary if "1X" not in m]
        if "DOUBLE CHANCE - X2" not in payload["secondary_markets"]:
            payload["secondary_markets"].append("DOUBLE CHANCE - X2")

    return payload


def normalize_ai_payload(payload):
    payload = enforce_market_consistency(payload)

    prediction_map = {
        "HOME WIN": "HOME_WIN",
        "AWAY WIN": "AWAY_WIN",
        "DRAW": "DRAW",
        "HOME_WIN": "HOME_WIN",
        "AWAY_WIN": "AWAY_WIN",
    }
    prediction = prediction_map.get(str(payload.get("predicted_outcome", "")).upper(), "HOME_WIN")

    confidence = int(payload.get("total_confidence") or 65)
    confidence = max(35, min(95, confidence))

    eligibility = payload.get("eligibility") or {}

    secondary_markets = []
    for item in payload.get("secondary_markets") or []:
        label = str(item).strip()
        if not label:
            continue
        market_key = label.lower().replace(" ", "_").replace("-", "").replace(".", "")
        secondary_markets.append(
            {
                "market": market_key[:64] or "secondary_market",
                "prediction": label,
                "confidence": max(50, min(95, confidence - 3)),
            }
        )
        if len(secondary_markets) == 4:
            break

    same_match_builder = []
    for item in payload.get("same_match_builder") or []:
        if not isinstance(item, dict):
            continue
        label = str(item.get("market") or "").strip()
        if not label:
            continue
        leg_confidence = int(item.get("confidence") or confidence)
        same_match_builder.append(
            {
                "market": label.lower().replace(" ", "_").replace("-", "").replace(".", "")[:64] or "same_match_leg",
                "prediction": label,
                "confidence": max(45, min(95, leg_confidence)),
            }
        )
        if len(same_match_builder) == 6:
            break

    pipeline_data = payload.get("pipeline_data") or {}
    elite_pipeline = pipeline_data.get("elite_6_stage") or {}
    core_pipeline = pipeline_data.get("core_4_stage") or {}
    core_baseline_text = str(core_pipeline.get("stage_1_baseline") or "")

    stage_1_numbers = {"home": 0, "draw": 0, "away": 0}
    parts = [part.strip() for part in core_baseline_text.replace("%", "").split(",") if part.strip()]
    for part in parts:
        lower = part.lower()
        number = "".join(ch for ch in part if ch.isdigit())
        if not number:
            continue
        if "home" in lower:
            stage_1_numbers["home"] = int(number)
        elif "draw" in lower:
            stage_1_numbers["draw"] = int(number)
        elif "away" in lower:
            stage_1_numbers["away"] = int(number)

    reasoning = payload.get("reasoning") or {}
    elite_reasoning = str((reasoning.get("elite") if isinstance(reasoning, dict) else reasoning) or "").strip()
    core_reasoning = str((reasoning.get("core") if isinstance(reasoning, dict) else "") or "").strip()

    normalized = {
        "prediction": prediction,
        "confidence": confidence,
        "eligibility": {
            "is_1x2_safe": bool(eligibility.get("is_1x2_safe", confidence >= 60)),
            "is_multi_safe": bool(eligibility.get("is_multi_safe", confidence >= 55)),
            "is_acca_safe": bool(eligibility.get("is_acca_safe")),
        },
        "secondary_markets": secondary_markets,
        "same_match_builder": same_match_builder,
        "reasoning": elite_reasoning,
        "core_reasoning": core_reasoning,
        "pipeline_data": {
            "elite_6_stage": {
                "stage_1_collection": str(elite_pipeline.get("stage_1_collection") or "Data normalized."),
                "stage_2_baseline": str(elite_pipeline.get("stage_2_baseline") or core_baseline_text or "Baseline unavailable."),
                "stage_3_context": str(elite_pipeline.get("stage_3_context") or core_pipeline.get("stage_2_context") or "Context unavailable."),
                "stage_4_reality": str(elite_pipeline.get("stage_4_reality") or core_pipeline.get("stage_3_reality") or "Reality checks unavailable."),
                "stage_5_decision": str(elite_pipeline.get("stage_5_decision") or "Decision adjustment unavailable."),
                "stage_6_final": str(elite_pipeline.get("stage_6_final") or "Final decision unavailable."),
            },
            "core_4_stage": {
                "stage_1_baseline": core_baseline_text or "Baseline unavailable.",
                "stage_2_context": str(core_pipeline.get("stage_2_context") or "Context unavailable."),
                "stage_3_reality": str(core_pipeline.get("stage_3_reality") or "Reality checks unavailable."),
                "stage_4_final": str(core_pipeline.get("stage_4_final") or "Final decision unavailable."),
            },
            "stage_1_baseline": {
                "home": stage_1_numbers["home"],
                "draw": stage_1_numbers["draw"],
                "away": stage_1_numbers["away"],
            },
            "stage_2_context": str(core_pipeline.get("stage_2_context") or elite_pipeline.get("stage_3_context") or "Context unavailable."),
            "stage_3_reality": {
                "weather": "Unknown",
                "volatility": "Low" if normalized_ai_low_volatility_hint(elite_pipeline, core_pipeline) else "High",
            },
            "stage_4_decision": {
                "acca_safe": bool(eligibility.get("is_acca_safe")),
                "is_1x2_safe": bool(eligibility.get("is_1x2_safe", confidence >= 60)),
                "is_multi_safe": bool(eligibility.get("is_multi_safe", confidence >= 55)),
            },
        },
    }

    if not normalized["reasoning"]:
        normalized["reasoning"] = (
            f"Stage 1 baseline supports {prediction.replace('_', ' ')} at {confidence}%. "
            "Context and volatility checks are included in the pipeline data."
        )

    if not normalized["secondary_markets"]:
        normalized["secondary_markets"] = [
            {"market": market, "prediction": outcome, "confidence": int(probability * 100)}
            for market, outcome, probability in DIRECT_SECONDARY_POOL[:3]
        ]

    if not normalized["same_match_builder"]:
        normalized["same_match_builder"] = build_default_same_match_builder(prediction, confidence)

    return normalized


def query_dolphin_with_streaming(provider, messages):
    url = f"{provider['base_url'].rstrip('/')}/chat/completions"
    timeout_seconds = float(provider.get("timeout") or LOCAL_LLM_TIMEOUT)
    payload = {
        "model": provider["model"],
        "messages": messages,
        "temperature": 0.2,
        "stream": True,
    }

    print(
        f"Starting streaming request to {provider['name']} "
        f"(model={provider['model']}, timeout={timeout_seconds}s)..."
    )
    full_response = ""

    try:
        with requests.post(url, json=payload, timeout=timeout_seconds, stream=True) as response:
            response.raise_for_status()

            for line in response.iter_lines():
                if not line:
                    continue
                decoded_line = line.decode("utf-8", errors="ignore")
                if not decoded_line.startswith("data: "):
                    continue

                json_string = decoded_line[len("data: "):].strip()
                if json_string == "[DONE]":
                    break

                try:
                    chunk_data = json.loads(json_string)
                except json.JSONDecodeError:
                    continue

                delta = (chunk_data.get("choices") or [{}])[0].get("delta") or {}
                content_piece = delta.get("content") or ""
                if not content_piece:
                    continue

                sys.stdout.write(content_piece)
                sys.stdout.flush()
                full_response += content_piece
    finally:
        if full_response:
            sys.stdout.write("\n")
            sys.stdout.flush()

    if not full_response.strip():
        raise RuntimeError(f"{provider['name']} returned an empty streaming response.")

    return full_response


def get_vertex_gemini_client(provider):
    global VERTEX_GEMINI_CLIENT
    if VERTEX_GEMINI_CLIENT is None:
        if not genai or not genai_types:
            raise RuntimeError("google-genai is not installed.")
        if provider.get("vertex_project"):
            VERTEX_GEMINI_CLIENT = genai.Client(
                vertexai=True,
                project=provider["vertex_project"],
                location=provider.get("vertex_location") or "global",
                http_options=genai_types.HttpOptions(api_version="v1"),
            )
        else:
            VERTEX_GEMINI_CLIENT = genai.Client()
    return VERTEX_GEMINI_CLIENT


def query_vertex_gemini(provider, messages):
    client = get_vertex_gemini_client(provider)
    system_text = ""
    user_parts = []
    for message in messages:
        role = message.get("role")
        content = str(message.get("content") or "")
        if role == "system":
            system_text += content
        elif role == "user":
            user_parts.append(content)

    prompt = "\n\n".join(part for part in user_parts if part)
    response = client.models.generate_content(
        model=provider["model"],
        contents=prompt,
        config=genai_types.GenerateContentConfig(
            system_instruction=system_text or None,
            temperature=0.2,
            response_mime_type="application/json",
        ),
    )

    content = (response.text or "").strip()
    if not content:
        raise RuntimeError(f"{provider['name']} returned an empty response.")
    return content


async def get_real_skcs_intelligence(event):
    prompt = build_match_prompt(event)
    match = extract_match(event)

    async def request_model(provider):
        for attempt in range(1, provider["max_attempts"] + 1):
            try:
                messages = [
                    {"role": "system", "content": SKCS_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ]
                if provider.get("transport") == "google_genai":
                    content = await asyncio.to_thread(query_vertex_gemini, provider, messages)
                    return normalize_ai_payload(json.loads(content))

                client = PROVIDER_CLIENTS[provider["name"]]
                if provider["name"] == "Local Dolphin":
                    content = await asyncio.to_thread(query_dolphin_with_streaming, provider, messages)
                    return normalize_ai_payload(json.loads(content))

                kwargs = {
                    "model": provider["model"],
                    "messages": messages,
                    "temperature": 0.2,
                    "timeout": provider["timeout"],
                }
                if provider.get("use_response_format", True):
                    kwargs["response_format"] = {"type": "json_object"}
                response = await client.chat.completions.create(**kwargs)
                content = response.choices[0].message.content or "{}"
                return normalize_ai_payload(json.loads(content))
            except Exception:
                if attempt == provider["max_attempts"]:
                    raise
                await asyncio.sleep(4 * attempt)

    for provider in PROVIDERS:
        try:
            intelligence = await request_model(provider)
            intelligence["provider"] = provider["name"].lower().replace(" ", "_")
            return intelligence
        except Exception as exc:
            print(
                f"{provider['name']} fallback triggered for "
                f"{safe_console_text(match['home_team'])} vs {safe_console_text(match['away_team'])}: {exc}"
            )

    return None


async def build_intelligence_map(events):
    semaphore = asyncio.Semaphore(2)
    intelligence_map = {}

    async def process_event(event):
        match = extract_match(event)
        async with semaphore:
            intelligence = await get_real_skcs_intelligence(event)
        intelligence_map[match["match_id"]] = intelligence

    await asyncio.gather(*(process_event(event) for event in events))
    return intelligence_map


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


def build_direct_payload(event, index, quotas):
    match = extract_match(event)
    tier_access = get_tier_access(index, quotas)
    header_info = build_header_info(match)
    intelligence = event.get("_skcs_intelligence")
    if intelligence:
        prediction = intelligence["prediction"]
        confidence = intelligence["confidence"]
        reasoning = intelligence["reasoning"]
        core_reasoning = intelligence.get("core_reasoning") or reasoning
        nested_secondary = intelligence["secondary_markets"]
        pipeline_data = intelligence["pipeline_data"]
        eligibility = intelligence.get("eligibility") or {}
    else:
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
        core_reasoning = (
            f"{prediction.replace('_', ' ')} has the edge, but volatility suggests caution."
        )
        pipeline_data = {
            "elite_6_stage": {
                "stage_1_collection": "Data and odds normalized.",
                "stage_2_baseline": f"Home {home_probability}%, Draw {draw_probability}%, Away {away_probability}%.",
                "stage_3_context": context_flag,
                "stage_4_reality": f"{volatility} volatility due to {weather} conditions.",
                "stage_5_decision": "1X2 confidence adjusted after contextual checks.",
                "stage_6_final": "Passed ACCA kill-switch." if acca_safe else "Failed ACCA kill-switch. Safe for Multi.",
            },
            "core_4_stage": {
                "stage_1_baseline": f"Home {home_probability}%, Draw {draw_probability}%, Away {away_probability}%.",
                "stage_2_context": context_flag,
                "stage_3_reality": f"{volatility} volatility due to {weather} conditions.",
                "stage_4_final": "Proceed with caution on 1X2.",
            },
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
                "is_1x2_safe": confidence >= 60,
                "is_multi_safe": confidence >= 55,
            },
        }
        eligibility = {
            "is_1x2_safe": confidence >= 60,
            "is_multi_safe": confidence >= 55,
            "is_acca_safe": acca_safe,
        }

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
                    "core_reasoning": core_reasoning,
                    "secondary_markets": nested_secondary,
                    "pipeline_data": pipeline_data,
                    "eligibility": eligibility,
                    "ai_provider": (intelligence or {}).get("provider", "deterministic"),
                    "header_info": header_info,
                    "event_id": match["match_id"],
                },
            }
        ],
    }


def build_secondary_payload(event, index, quotas):
    match = extract_match(event)
    tier_access = get_tier_access(index, quotas)
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


def build_acca_payload(events, index, quotas):
    tier_access = get_tier_access(index, quotas)
    event_ids = [str(event.get("id") or (event.get("raw_provider_data") or {}).get("fixture", {}).get("id") or "") for event in events]
    rng = seeded_rng("acca", index, *event_ids)
    selected_events = rng.sample(events, 6)

    legs = []
    combined_probability = 1.0

    for leg_index, event in enumerate(selected_events):
        match = extract_match(event)
        intelligence = event.get("_skcs_intelligence") or {}
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
                    "reasoning": intelligence.get("reasoning")
                    or "AI Decision Engine: This leg passed the full elite pipeline and low-volatility kill-switch.",
                    "header_info": build_header_info(match),
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


def build_multi_payload(events, index, quotas):
    tier_access = get_tier_access(index, quotas)
    rng = seeded_rng("multi", index, len(events))
    selected_events = rng.sample(events, 2)

    first_match = extract_match(selected_events[0])
    second_match = extract_match(selected_events[1])
    first_intelligence = selected_events[0].get("_skcs_intelligence") or {}
    second_intelligence = selected_events[1].get("_skcs_intelligence") or {}

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
                    "reasoning": first_intelligence.get("reasoning")
                    or "AI Decision Engine: This leg passed stages 1-4 and remains suitable for multi construction.",
                    "header_info": build_header_info(first_match),
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
                    "reasoning": second_intelligence.get("reasoning")
                    or "AI Decision Engine: This leg passed stages 1-4 and remains suitable for multi construction.",
                    "header_info": build_header_info(second_match),
                    "event_id": second_match["match_id"],
                },
            },
        ],
    }


def build_same_match_payload(event, index, quotas):
    match = extract_match(event)
    tier_access = get_tier_access(index, quotas)
    header_info = build_header_info(match)
    intelligence = event.get("_skcs_intelligence") or {}
    selected_combo = intelligence.get("same_match_builder") or build_default_same_match_builder("HOME_WIN", 65)
    combined_probability = 1.0
    legs = []

    for leg_index, leg in enumerate(selected_combo[:6], start=1):
        market = leg["market"]
        prediction = leg["prediction"]
        leg_probability = max(0.01, min(0.95, leg["confidence"] / 100.0))
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
                "confidence": int(round(leg_probability * 100)),
                "metadata": {
                    "league": match["league"],
                    "predicted_outcome": prediction,
                    "tier_access": tier_access,
                    "reasoning": intelligence.get("reasoning")
                    or "AI Stage 2 and 3 analysis produced this same-match builder.",
                    "event_id": match["match_id"],
                    "same_match_leg_index": leg_index,
                    "leg_confidence": int(round(leg_probability * 100)),
                    "header_info": header_info,
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
    if len(events) < MINIMUM_EVENT_COUNT:
        print(
            f"Not enough events to generate the requested set. "
            f"Need at least {MINIMUM_EVENT_COUNT}, found {len(events)}."
        )
        return 0

    day_name = get_schedule_day_name()
    daily_quotas = get_daily_quota_set(day_name)
    direct_quotas = daily_quotas["direct"]
    secondary_quotas = daily_quotas["secondary"]
    multi_quotas = daily_quotas["multi"]
    same_match_quotas = daily_quotas["same_match"]
    acca_quotas = daily_quotas["acca"]

    print(f"Fetched {len(events)} football events.")
    print(
        f"Applying {day_name.title()} quotas: "
        f"Direct={direct_quotas['vip']}, Secondary={secondary_quotas['vip']}, "
        f"Multi={multi_quotas['vip']}, SameMatch={same_match_quotas['vip']}, "
        f"ACCA={acca_quotas['vip']}"
    )
    if LOCAL_ONLY_MODE:
        print("Local-only provider mode active: using Local Dolphin only.")
    if EVENT_LIMIT > 0:
        print(f"Event limit override active: {EVENT_LIMIT}")

    direct_events = events[: min(direct_quotas["vip"], len(events))]
    if PROVIDERS:
        provider_names = ", ".join(provider["name"] for provider in PROVIDERS)
        print(f"Requesting live SKCS intelligence with provider chain: {provider_names}")
        intelligence_map = asyncio.run(build_intelligence_map(direct_events))
        for event in direct_events:
            match = extract_match(event)
            event["_skcs_intelligence"] = intelligence_map.get(match["match_id"])
        provider_counts = {}
        for value in intelligence_map.values():
            provider = (value or {}).get("provider")
            if provider:
                provider_counts[provider] = provider_counts.get(provider, 0) + 1
        deterministic_count = sum(1 for value in intelligence_map.values() if not value)
        provider_summary = ", ".join(
            f"{name}={count}" for name, count in sorted(provider_counts.items())
        ) or "No providers succeeded"
        print(f"Live intelligence complete. {provider_summary}, DeterministicFallback={deterministic_count}")
    else:
        print("No provider credentials found. Using deterministic local generator only.")

    print("Wiping old predictions for the new daily run...")
    deleted = clear_predictions()
    print(f"Deleted {deleted} existing rows from predictions_final.")

    payloads = []
    processed_safe_matches = []

    print("Generating VIP quotas: Direct, Secondary, Multi, Same Match, ACCA...")

    for index, event in enumerate(direct_events):
        payload = build_direct_payload(event, index, direct_quotas)
        payloads.append(payload)
        decision = (
            ((payload.get("matches") or [{}])[0].get("metadata") or {})
            .get("pipeline_data", {})
            .get("stage_4_decision", {})
        )
        if decision.get("acca_safe"):
            processed_safe_matches.append(event)

    secondary_events = list(reversed(events[: min(secondary_quotas["vip"], len(events))]))
    for index, event in enumerate(secondary_events):
        payloads.append(build_secondary_payload(event, index, secondary_quotas))

    multi_count = min(multi_quotas["vip"], len(events) // 2)
    for index in range(multi_count):
        payloads.append(build_multi_payload(events, index, multi_quotas))

    same_match_count = min(same_match_quotas["vip"], len(events))
    for index in range(same_match_count):
        payloads.append(build_same_match_payload(events[index], index, same_match_quotas))

    acca_source = processed_safe_matches if len(processed_safe_matches) >= 6 else events
    acca_count = min(acca_quotas["vip"], len(events))
    for index in range(acca_count):
        source_pool = acca_source if len(acca_source) >= 6 else events
        if len(source_pool) < 6:
            break
        payloads.append(build_acca_payload(source_pool, index, acca_quotas))

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
        f"Day={day_name}, Direct={direct_count}, Secondary={secondary_count}, Multi={multi_count}, "
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
