"""
CLR Local Pipeline Test Harness
================================
Runs the three core ingestion scenarios (PLACE, RECIPE, GEAR) directly against
Groq, Google Maps, and Supabase — no Telegram or HTTP server required.

Usage:
    cd backend
    python test_pipeline.py              # run all three scenarios
    python test_pipeline.py place        # run only the PLACE scenario
    python test_pipeline.py recipe
    python test_pipeline.py gear
"""

import json
import os
import sys
import textwrap

import requests
from dotenv import load_dotenv
from groq import Groq
from supabase import create_client

from prompts import get_extraction_prompt

load_dotenv()

# ── Colour helpers ──────────────────────────────────────────────────────────
GREEN = "\033[92m"
RED   = "\033[91m"
CYAN  = "\033[96m"
BOLD  = "\033[1m"
RESET = "\033[0m"

def ok(msg):  print(f"  {GREEN}✅ {msg}{RESET}")
def err(msg): print(f"  {RED}❌ {msg}{RESET}")
def info(msg):print(f"  {CYAN}ℹ️  {msg}{RESET}")
def section(title):
    print(f"\n{BOLD}{'─'*60}")
    print(f"  {title}")
    print(f"{'─'*60}{RESET}")

# ── Test scenarios ───────────────────────────────────────────────────────────
SCENARIOS = {
    "place": {
        "label": "PLACE — Restaurant from text",
        "user_text": "Amazing date night at Kalamata Greek Kitchen in Tel Aviv, Israel. Best hummus ever.",
        "scraped_title": "",
        "scraped_caption": "",
        "expected_type": "PLACE",
    },
    "recipe": {
        "label": "RECIPE — Keto steak from text",
        "user_text": (
            "Quick keto ribeye: 1 ribeye steak, 2 tbsp butter, salt, rosemary. "
            "Prep 10 mins, cook 15 mins, serves 1. Difficulty: Easy."
        ),
        "scraped_title": "",
        "scraped_caption": "",
        "expected_type": "RECIPE",
    },
    "gear": {
        "label": "GEAR — Cast iron skillet",
        "user_text": "Need to buy a Lodge Cast Iron Skillet 12-inch for about $40 from Amazon.",
        "scraped_title": "Lodge 12 Inch Cast Iron Skillet",
        "scraped_caption": "Pre-seasoned, ready to use. Great for stovetop and oven.",
        "expected_type": "GEAR",
    },
}

# ── Service clients ──────────────────────────────────────────────────────────
GROQ_API_KEY    = os.getenv("GROQ_API_KEY")
MAPS_API_KEY    = os.getenv("MAPS_API_KEY")
SUPABASE_URL    = os.getenv("SUPABASE_URL")
SUPABASE_KEY    = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None
supabase    = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None


def check_env():
    section("0 / Environment Check")
    required = {
        "GROQ_API_KEY":           GROQ_API_KEY,
        "MAPS_API_KEY":           MAPS_API_KEY,
        "SUPABASE_URL":           SUPABASE_URL,
        "SUPABASE_SERVICE_ROLE_KEY": SUPABASE_KEY,
        "TELEGRAM_BOT_TOKEN":     os.getenv("TELEGRAM_BOT_TOKEN"),
    }
    all_ok = True
    for key, val in required.items():
        if val:
            ok(f"{key} is set")
        else:
            err(f"{key} is MISSING — some stages will be skipped")
            all_ok = False
    return all_ok


def stage_groq(scenario: dict) -> dict | None:
    """Stage 2: LLM extraction."""
    section("Stage 2 / Groq LLM Extraction")
    if not groq_client:
        err("Groq client not initialised — set GROQ_API_KEY")
        return None

    prompt = get_extraction_prompt(
        scenario["user_text"],
        scenario["scraped_title"],
        scenario["scraped_caption"],
    )
    info(f"Input text: \"{scenario['user_text'][:100]}\"")

    try:
        completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama3-70b-8192",
            temperature=0.0,
        )
        raw = completion.choices[0].message.content
        raw = raw.replace("```json", "").replace("```", "").strip()

        data = json.loads(raw)
        ok(f"type='{data.get('type')}'  title='{data.get('title')}'")
        info(f"context_tags={data.get('context_tags', [])}")
        info(f"specific_data keys: {list(data.get('specific_data', {}).keys())}")

        expected = scenario["expected_type"]
        if data.get("type") != expected:
            err(f"Classification mismatch: expected {expected}, got {data.get('type')}")
        else:
            ok(f"Classification correct: {expected}")

        return data

    except json.JSONDecodeError as e:
        err(f"JSON parse error: {e}")
        err(f"Raw LLM output:\n{textwrap.indent(raw, '    ')}")
        return None
    except Exception as e:
        err(f"Groq error: {e}")
        return None


def stage_geocode(extracted_data: dict) -> dict:
    """Stage 3: Google Maps geocoding (PLACE only)."""
    section("Stage 3 / Google Maps Geocoding")
    specific_data = extracted_data.get("specific_data", {})

    if extracted_data.get("type") != "PLACE":
        info(f"Skipping geocoding for type={extracted_data.get('type')}")
        return specific_data

    if not MAPS_API_KEY:
        err("MAPS_API_KEY not set — geocoding skipped, coordinates will be 0.0")
        return specific_data

    address = specific_data.get("location", {}).get("address", "")
    if not address:
        err("No address in PLACE payload")
        return specific_data

    info(f"Geocoding: \"{address}\"")
    url = (
        f"https://maps.googleapis.com/maps/api/geocode/json"
        f"?address={requests.utils.quote(address)}&key={MAPS_API_KEY}"
    )
    try:
        res = requests.get(url, timeout=5).json()
        status = res.get("status")

        if status == "OK" and res.get("results"):
            loc = res["results"][0]["geometry"]["location"]
            fmt = res["results"][0]["formatted_address"]
            specific_data["location"]["lat"] = loc["lat"]
            specific_data["location"]["lng"] = loc["lng"]
            specific_data["location"]["address"] = fmt
            ok(f"Resolved → lat={loc['lat']}, lng={loc['lng']}")
            ok(f"Formatted address: \"{fmt}\"")
        else:
            err(f"Geocoding API status={status} (check API key restrictions or quota)")
            if status == "REQUEST_DENIED":
                err("REQUEST_DENIED: verify MAPS_API_KEY is enabled for Geocoding API in Google Cloud Console")

    except Exception as e:
        err(f"Geocoding request failed: {e}")

    return specific_data


def stage_supabase(extracted_data: dict, specific_data: dict, scenario: dict) -> bool:
    """Stage 4: Supabase insert."""
    section("Stage 4 / Supabase Insert")

    payload = {
        "type":         extracted_data.get("type", "UNKNOWN"),
        "title":        extracted_data.get("title", "Test Item"),
        "thumbnail_url":"https://via.placeholder.com/400?text=Test",
        "context_tags": extracted_data.get("context_tags", []),
        "original_url": "",
        "specific_data":specific_data,
    }

    info(f"Payload to insert:\n{textwrap.indent(json.dumps(payload, indent=2), '    ')}")

    if not supabase:
        err("Supabase client not initialised — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
        info("DB stage skipped; payload above is what would be written.")
        return False

    try:
        response = supabase.table("culinary_items").insert(payload).execute()
        if response.data:
            row = response.data[0]
            ok(f"Row inserted. id={row.get('id')}  type={row.get('type')}  title='{row.get('title')}'")
            return True
        else:
            err(f"Supabase returned no data: {response}")
            return False
    except Exception as e:
        err(f"Supabase error: {e}")
        if "relation" in str(e).lower() or "does not exist" in str(e).lower():
            err("Table 'culinary_items' not found — run your Supabase migration first.")
        return False


def run_scenario(key: str):
    scenario = SCENARIOS[key]
    print(f"\n{BOLD}{'═'*60}")
    print(f"  SCENARIO: {scenario['label']}")
    print(f"{'═'*60}{RESET}")

    extracted = stage_groq(scenario)
    if extracted is None:
        err("Groq stage failed — aborting this scenario.")
        return

    specific_data = stage_geocode(extracted)
    stage_supabase(extracted, specific_data, scenario)


def main():
    check_env()

    target = sys.argv[1].lower() if len(sys.argv) > 1 else "all"

    if target == "all":
        for key in SCENARIOS:
            run_scenario(key)
    elif target in SCENARIOS:
        run_scenario(target)
    else:
        print(f"Unknown scenario '{target}'. Choose from: {', '.join(SCENARIOS)} or 'all'")
        sys.exit(1)

    print(f"\n{BOLD}{'═'*60}")
    print("  Pipeline test complete.")
    print(f"{'═'*60}{RESET}\n")


if __name__ == "__main__":
    main()
