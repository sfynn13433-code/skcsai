import asyncio
import json
import os
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
VENDOR_DIR = SCRIPT_DIR / "_vendor"
RESULTS_DIR = SCRIPT_DIR / "results"
RESULTS_DIR.mkdir(exist_ok=True)

if VENDOR_DIR.exists():
    sys.path.insert(0, str(VENDOR_DIR))

from openai import AsyncOpenAI


load_dotenv(SCRIPT_DIR / ".env")
load_dotenv(PROJECT_ROOT / ".env")
load_dotenv()


SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


PROVIDERS = [
    {
        "name": "Local Dolphin",
        "base_url": "http://127.0.0.1:8080/v1",
        "api_key": "sk-local",
        "model": "Dolphin3.0-Llama3.2-3B-Q5_K_M.gguf",
        "timeout": 60.0,
        "use_response_format": False,
    },
    {
        "name": "Groq Llama 3.3 70B",
        "base_url": "https://api.groq.com/openai/v1",
        "api_key": os.getenv("GROQ_KEY"),
        "model": "llama-3.3-70b-versatile",
        "timeout": 20.0,
        "use_response_format": True,
    },
    {
        "name": "Gemini 2.5 Flash",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "api_key": os.getenv("GEMINI_API_KEY"),
        "model": "gemini-2.5-flash",
        "timeout": 25.0,
        "use_response_format": True,
    },
]

SYSTEM_PROMPT = """
You are the SKCS AI Sports Edge analytical engine.
Analyze the provided football match data.
Return valid JSON only, with no markdown and no extra text.
Schema:
{
  "predicted_outcome": "HOME WIN",
  "total_confidence": 72,
  "secondary_markets": ["OVER 1.5 GOALS", "DOUBLE CHANCE - 1X", "BTTS - YES"],
  "pipeline_data": {
    "stage_1_baseline": {"home": 55, "draw": 25, "away": 20},
    "stage_2_context": "Missing 1 key defender.",
    "stage_3_reality": {"weather": "Clear", "volatility": "Low"},
    "stage_4_decision": {"acca_safe": true}
  },
  "reasoning": "Stage 1 Baseline gives HOME WIN a 55% edge. Stage 2 Context notes full strength squad."
}
""".strip()

EXPECTED_KEYS = {
    "predicted_outcome",
    "total_confidence",
    "secondary_markets",
    "pipeline_data",
    "reasoning",
}


def fetch_real_matches(limit=3):
    response = (
        supabase.table("canonical_events")
        .select("id,start_time_utc,competition_name,raw_provider_data")
        .eq("sport", "football")
        .order("start_time_utc")
        .limit(limit)
        .execute()
    )
    return response.data or []


def build_match_prompt(event):
    raw_data = event.get("raw_provider_data") or {}
    teams = raw_data.get("teams") or {}
    league = raw_data.get("league") or {}
    fixture = raw_data.get("fixture") or {}

    home = ((teams.get("home") or {}).get("name")) or "Unknown Home"
    away = ((teams.get("away") or {}).get("name")) or "Unknown Away"
    league_name = league.get("name") or event.get("competition_name") or "Football"
    country = league.get("country") or "Unknown Country"
    start_time = event.get("start_time_utc") or fixture.get("date") or "Unknown kickoff"

    return (
        f"Match: {home} vs {away}\n"
        f"Competition: {league_name} ({country})\n"
        f"Kickoff UTC: {start_time}\n"
        "Task: produce the SKCS structured JSON prediction for this fixture."
    )


def extract_json_score(payload):
    score = 0
    notes = []

    if not isinstance(payload, dict):
        return {"score": 0, "max_score": 11, "notes": ["Payload is not a JSON object."]}

    for key in EXPECTED_KEYS:
        if key in payload:
            score += 1
        else:
            notes.append(f"Missing top-level key: {key}")

    if isinstance(payload.get("secondary_markets"), list):
        score += 1
    else:
        notes.append("secondary_markets is not a list")

    pipeline = payload.get("pipeline_data")
    if isinstance(pipeline, dict):
        score += 1
        for stage_key in [
            "stage_1_baseline",
            "stage_2_context",
            "stage_3_reality",
            "stage_4_decision",
        ]:
            if stage_key in pipeline:
                score += 1
            else:
                notes.append(f"Missing pipeline stage: {stage_key}")
    else:
        notes.append("pipeline_data is not an object")

    return {"score": score, "max_score": 11, "notes": notes}


async def request_provider(provider, user_prompt):
    client = AsyncOpenAI(api_key=provider["api_key"], base_url=provider["base_url"])
    kwargs = {
        "model": provider["model"],
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.1,
        "timeout": provider["timeout"],
    }
    if provider["use_response_format"]:
        kwargs["response_format"] = {"type": "json_object"}

    response = await client.chat.completions.create(**kwargs)
    return response.choices[0].message.content or ""


async def test_provider_on_match(provider, event):
    match_prompt = build_match_prompt(event)
    raw_data = event.get("raw_provider_data") or {}
    teams = raw_data.get("teams") or {}
    home = ((teams.get("home") or {}).get("name")) or "Unknown Home"
    away = ((teams.get("away") or {}).get("name")) or "Unknown Away"

    try:
        start_time = time.perf_counter()
        raw_output = await request_provider(provider, match_prompt)
        elapsed = time.perf_counter() - start_time

        payload = json.loads(raw_output)
        score = extract_json_score(payload)
        return {
            "provider": provider["name"],
            "match": f"{home} vs {away}",
            "status": "success",
            "elapsed_seconds": round(elapsed, 2),
            "json_score": score["score"],
            "json_score_max": score["max_score"],
            "prediction": payload.get("predicted_outcome"),
            "confidence": payload.get("total_confidence"),
            "reasoning": payload.get("reasoning"),
            "notes": score["notes"],
        }
    except Exception as exc:
        return {
            "provider": provider["name"],
            "match": f"{home} vs {away}",
            "status": "error",
            "elapsed_seconds": None,
            "json_score": None,
            "json_score_max": None,
            "prediction": None,
            "confidence": None,
            "reasoning": None,
            "notes": [repr(exc)],
        }


def rank_results(results):
    grouped = defaultdict(list)
    for result in results:
        grouped[result["provider"]].append(result)

    ranking = []
    for provider_name, items in grouped.items():
        success_items = [item for item in items if item["status"] == "success"]
        success_rate = len(success_items) / len(items) if items else 0.0
        avg_speed = (
            sum(item["elapsed_seconds"] for item in success_items) / len(success_items)
            if success_items
            else None
        )
        avg_json = (
            sum(item["json_score"] for item in success_items) / len(success_items)
            if success_items
            else None
        )

        ranking.append(
            {
                "provider": provider_name,
                "matches_tested": len(items),
                "success_rate": round(success_rate, 2),
                "average_speed_seconds": round(avg_speed, 2) if avg_speed is not None else None,
                "average_json_score": round(avg_json, 2) if avg_json is not None else None,
            }
        )

    ranking.sort(
        key=lambda item: (
            -item["success_rate"],
            item["average_speed_seconds"] if item["average_speed_seconds"] is not None else 9999,
            -(item["average_json_score"] if item["average_json_score"] is not None else 0),
        )
    )
    return ranking


async def run_real_match_arena(limit=3):
    events = fetch_real_matches(limit=limit)
    if not events:
        print("No football canonical events available for testing.")
        return

    print("REAL MATCH MODEL ARENA")
    print(f"Testing {len(events)} real football fixtures across Dolphin, Groq, and Gemini.\n")

    results = []
    for event in events:
        raw_data = event.get("raw_provider_data") or {}
        teams = raw_data.get("teams") or {}
        home = ((teams.get("home") or {}).get("name")) or "Unknown Home"
        away = ((teams.get("away") or {}).get("name")) or "Unknown Away"
        print(f"Fixture: {home} vs {away}")

        for provider in PROVIDERS:
            if provider["name"] != "Local Dolphin" and not provider["api_key"]:
                print(f"- {provider['name']}: skipped (missing API key)")
                continue

            result = await test_provider_on_match(provider, event)
            results.append(result)

            if result["status"] == "success":
                print(
                    f"- {provider['name']}: success | "
                    f"{result['elapsed_seconds']:.2f}s | "
                    f"json={result['json_score']}/{result['json_score_max']} | "
                    f"{result['prediction']} ({result['confidence']}%)"
                )
            else:
                print(f"- {provider['name']}: error | {result['notes'][0]}")
        print("")

    ranking = rank_results(results)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output = {
        "matches_tested": len(events),
        "results": results,
        "ranking": ranking,
    }
    output_path = RESULTS_DIR / f"ai_real_match_arena_{timestamp}.json"
    output_path.write_text(json.dumps(output, indent=2), encoding="utf-8")

    print("RANKING")
    for index, item in enumerate(ranking, start=1):
        print(
            f"{index}. {item['provider']} | success_rate={item['success_rate']:.2f} | "
            f"avg_speed={item['average_speed_seconds']}s | avg_json={item['average_json_score']}"
        )

    print(f"\nSaved results to {output_path}")


if __name__ == "__main__":
    asyncio.run(run_real_match_arena())
