import asyncio
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
VENDOR_DIR = SCRIPT_DIR / "_vendor"

if VENDOR_DIR.exists():
    sys.path.insert(0, str(VENDOR_DIR))

from openai import AsyncOpenAI
import httpx

load_dotenv(SCRIPT_DIR / ".env")
load_dotenv(PROJECT_ROOT / ".env")
load_dotenv()


PROVIDERS = [
    {
        "name": "1. Local Server (Dolphin)",
        "base_url": "http://127.0.0.1:8080/v1",
        "api_key": "sk-local",
        "model": "Dolphin3.0-Llama3.2-3B-Q5_K_M.gguf",
        "mode": "chat",
        "timeout": 60.0,
    },
    {
        "name": "2. Groq (Llama 3.3 70B)",
        "base_url": "https://api.groq.com/openai/v1",
        "api_key": os.getenv("GROQ_KEY"),
        "model": "llama-3.3-70b-versatile",
        "mode": "chat",
        "timeout": 15.0,
    },
    {
        "name": "3. Gemini 2.5 Flash",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "api_key": os.getenv("GEMINI_API_KEY"),
        "model": "gemini-2.5-flash",
        "mode": "chat",
        "timeout": 20.0,
    },
    {
        "name": "4. DeepSeek",
        "base_url": "https://api.deepseek.com/v1",
        "api_key": os.getenv("DEEPSEEK_API_KEY"),
        "model": "deepseek-chat",
        "mode": "chat",
        "timeout": 15.0,
    },
    {
        "name": "5. OpenAI (GPT-4o-mini)",
        "base_url": "https://api.openai.com/v1",
        "api_key": os.getenv("OPENAI_KEY"),
        "model": "gpt-4o-mini",
        "mode": "chat",
        "timeout": 15.0,
    },
    {
        "name": "6. OpenRouter (Mistral/Llama mix)",
        "base_url": "https://openrouter.ai/api/v1",
        "api_key": os.getenv("OPENROUTER_API_KEY"),
        "model": "meta-llama/llama-3.2-3b-instruct",
        "mode": "chat",
        "timeout": 15.0,
    },
]

SYSTEM_PROMPT = """
You are the SKCS AI Sports Edge analytical engine.
Analyze the provided match data.
You MUST output a valid JSON object following this exact schema, with NO markdown formatting (do not use ```json) and NO extra text:
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

TEST_MATCH = (
    "Match: Arsenal vs Chelsea\n"
    "Stats: Arsenal is on a 5-match win streak. Chelsea is missing their starting goalkeeper.\n"
    "Odds: Home 1.85, Draw 3.4, Away 4.2"
)

RESULTS_DIR = SCRIPT_DIR / "results"
RESULTS_DIR.mkdir(exist_ok=True)

EXPECTED_KEYS = {
    "predicted_outcome",
    "total_confidence",
    "secondary_markets",
    "pipeline_data",
    "reasoning",
}


def build_prompt():
    return f"{SYSTEM_PROMPT}\n\n{TEST_MATCH}"


def extract_json_score(payload):
    score = 0
    notes = []

    if not isinstance(payload, dict):
        return {"score": score, "max_score": 11, "notes": ["Payload is not a JSON object."]}

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


async def request_chat(provider):
    client = AsyncOpenAI(
        api_key=provider["api_key"],
        base_url=provider["base_url"],
    )
    response = await client.chat.completions.create(
        model=provider["model"],
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": TEST_MATCH},
        ],
        temperature=0.1,
        timeout=provider["timeout"],
        **(
            {"response_format": {"type": "json_object"}}
            if provider["name"] != "1. Local Server (Dolphin)"
            else {}
        ),
    )
    return response.choices[0].message.content or ""


async def test_provider(provider):
    if provider["name"] != "1. Local Server (Dolphin)" and not provider["api_key"]:
        print(f"Skipping {provider['name']} - no API key found in environment")
        return

    print("\n========================================")
    print(f"TESTING: {provider['name']}")
    print("========================================")

    result = {
        "provider": provider["name"],
        "model": provider["model"],
        "base_url": provider["base_url"],
        "status": "unknown",
        "elapsed_seconds": None,
        "json_score": None,
        "json_score_max": None,
        "notes": [],
        "prediction": None,
        "confidence": None,
        "reasoning": None,
        "raw_output_preview": None,
    }

    try:
        start_time = time.perf_counter()
        raw_output = await request_chat(provider)
        elapsed = time.perf_counter() - start_time
        result["elapsed_seconds"] = round(elapsed, 2)
        try:
            payload = json.loads(raw_output)
            score = extract_json_score(payload)
            result["status"] = "success"
            result["json_score"] = score["score"]
            result["json_score_max"] = score["max_score"]
            result["notes"] = score["notes"]
            result["prediction"] = payload.get("predicted_outcome")
            result["confidence"] = payload.get("total_confidence")
            result["reasoning"] = payload.get("reasoning")
            print("STATUS: SUCCESS")
            print(f"SPEED: {elapsed:.2f} seconds")
            print(f"JSON SCORE: {score['score']}/{score['max_score']}")
            print(
                f"PREDICTION: {payload.get('predicted_outcome')} "
                f"({payload.get('total_confidence')}%)"
            )
            print(f"REASONING: {payload.get('reasoning')}")
        except json.JSONDecodeError:
            result["status"] = "failed_json_validation"
            result["raw_output_preview"] = raw_output[:500]
            print("STATUS: FAILED JSON VALIDATION")
            print(f"SPEED: {elapsed:.2f} seconds")
            print(f"RAW OUTPUT: {raw_output[:200]}...")
    except Exception as exc:
        result["status"] = "connection_or_api_error"
        result["notes"] = [repr(exc)]
        print("STATUS: CONNECTION/API ERROR")
        print(f"DETAILS: {repr(exc)}")

    return result


async def run_arena():
    print("WELCOME TO THE SKCS MODEL ARENA")
    print("Testing models for speed, formatting, and analytical intelligence...\n")

    results = []
    for provider in PROVIDERS:
        result = await test_provider(provider)
        if result:
            results.append(result)
        await asyncio.sleep(1)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    results_path = RESULTS_DIR / f"ai_provider_arena_{timestamp}.json"
    results_path.write_text(json.dumps(results, indent=2), encoding="utf-8")

    print("\nARENA SUMMARY")
    for result in results:
        speed = (
            f"{result['elapsed_seconds']:.2f}s"
            if isinstance(result["elapsed_seconds"], (int, float))
            else "n/a"
        )
        score = (
            f"{result['json_score']}/{result['json_score_max']}"
            if result["json_score"] is not None
            else "n/a"
        )
        print(f"- {result['provider']}: {result['status']} | speed={speed} | json={score}")
    print(f"\nSaved results to {results_path}")


if __name__ == "__main__":
    asyncio.run(run_arena())
