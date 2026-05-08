import os
import re
import json
import requests
from typing import Optional
from bs4 import BeautifulSoup
from flask import Flask, request, jsonify
from groq import Groq
from supabase import create_client, Client
from dotenv import load_dotenv

from prompts import get_extraction_prompt

load_dotenv()

app = Flask(__name__)

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
MAPS_API_KEY = os.getenv("MAPS_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

groq_client: Optional[Groq] = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None
supabase: Optional[Client] = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None


def send_telegram_message(chat_id, text):
    if not TELEGRAM_BOT_TOKEN:
        print(f"[TELEGRAM] Would send: {text}")
        return
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    requests.post(url, json={"chat_id": chat_id, "text": text})


def extract_url(text):
    urls = re.findall(r'(https?://[^\s]+)', text)
    return urls[0] if urls else None


def scrape_metadata(url):
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        response = requests.get(url, headers=headers, timeout=5)
        soup = BeautifulSoup(response.text, 'html.parser')

        og_image = soup.find('meta', property='og:image')
        og_title = soup.find('meta', property='og:title')
        og_desc = soup.find('meta', property='og:description')

        title = og_title['content'] if og_title else (soup.title.string if soup.title else "")
        description = og_desc['content'] if og_desc else ""
        thumbnail_url = og_image['content'] if og_image else "https://via.placeholder.com/400?text=No+Thumbnail"

        print(f"[SCRAPE] title='{title[:80]}' description_len={len(description)}")
        return thumbnail_url, title, description
    except Exception as e:
        print(f"[SCRAPE] Error for {url}: {e}")
        return "https://via.placeholder.com/400?text=Extraction+Failed", "Unknown Title", ""


def geocode_address(address):
    if not MAPS_API_KEY:
        print("[GEOCODE] MAPS_API_KEY not set — skipping geocoding.")
        return 0.0, 0.0, address

    url = f"https://maps.googleapis.com/maps/api/geocode/json?address={requests.utils.quote(address)}&key={MAPS_API_KEY}"
    try:
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        res = response.json()

        if res.get('status') == 'OK' and res.get('results'):
            loc = res['results'][0]['geometry']['location']
            fmt_address = res['results'][0]['formatted_address']
            print(f"[GEOCODE] ✅ Resolved '{address}' → lat={loc['lat']}, lng={loc['lng']}")
            return loc['lat'], loc['lng'], fmt_address

        print(f"[GEOCODE] ⚠️  API status={res.get('status')} for address='{address}'")
    except requests.exceptions.RequestException as e:
        print(f"[GEOCODE] Network error: {e}")
    except ValueError as e:
        print(f"[GEOCODE] JSON parse error: {e}")
    except Exception as e:
        print(f"[GEOCODE] Unexpected error: {e}")

    return 0.0, 0.0, address


@app.route('/', methods=['GET'])
def health_check():
    return jsonify({"status": "CLR Backend is running", "environment": "local"}), 200


@app.route('/api/webhook', methods=['POST'])
def telegram_webhook():
    update = request.get_json()

    if not update or "message" not in update:
        return jsonify({"status": "ignored"}), 200

    message = update["message"]
    chat_id = message["chat"]["id"]
    text = message.get("text", "")
    print(f"\n{'='*60}")
    print(f"[WEBHOOK] New message from chat_id={chat_id}: '{text[:120]}'")

    send_telegram_message(chat_id, "🔍 Processing your culinary intel...")

    # --- Stage 1: URL extraction & metadata scraping ---
    url = extract_url(text)
    thumbnail_url = "https://via.placeholder.com/400?text=Text+Only"
    scraped_title = ""
    scraped_caption = ""

    if url:
        print(f"[STAGE 1] Scraping URL: {url}")
        thumbnail_url, scraped_title, scraped_caption = scrape_metadata(url)
    elif not text:
        send_telegram_message(chat_id, "⚠️ Please send a URL or text note.")
        return jsonify({"status": "ignored"}), 200

    # --- Stage 2: LLM parsing via Groq ---
    if not groq_client:
        send_telegram_message(chat_id, "❌ Error: Groq configuration missing.")
        return jsonify({"status": "error", "message": "Missing Groq configuration"}), 500

    print(f"[STAGE 2] Sending to Groq LLM (llama3-70b-8192)...")
    prompt = get_extraction_prompt(text, scraped_title, scraped_caption)
    raw_output = ""

    try:
        chat_completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama3-70b-8192",
            temperature=0.0
        )
        raw_output = chat_completion.choices[0].message.content
        # Strip markdown code fences if the model wraps its output
        raw_output = raw_output.replace("```json", "").replace("```", "").strip()
        extracted_data = json.loads(raw_output)
        print(f"[STAGE 2] ✅ Groq returned type={extracted_data.get('type')} title='{extracted_data.get('title')}'")

    except json.JSONDecodeError as e:
        print(f"[STAGE 2] ❌ Groq JSON parsing error: {e}\nRaw output:\n{raw_output}")
        send_telegram_message(chat_id, "❌ LLM returned invalid JSON. Please try again.")
        return jsonify({"status": "error", "message": "Invalid JSON from LLM"}), 500
    except Exception as e:
        print(f"[STAGE 2] ❌ Groq LLM error: {e}")
        send_telegram_message(chat_id, "❌ Failed to parse context with LLM.")
        return jsonify({"status": "error"}), 500

    # --- Stage 3: Geocoding (PLACE type only) ---
    item_type = extracted_data.get("type", "PLACE")
    specific_data = extracted_data.get("specific_data", {})

    if item_type == "PLACE" and "location" in specific_data:
        raw_address = specific_data["location"].get("address", "")
        if raw_address:
            print(f"[STAGE 3] Geocoding address: '{raw_address}'")
            lat, lng, fmt_address = geocode_address(raw_address)
            specific_data["location"]["lat"] = lat
            specific_data["location"]["lng"] = lng
            specific_data["location"]["address"] = fmt_address
        else:
            print("[STAGE 3] No address in PLACE payload — skipping geocoding.")
    else:
        print(f"[STAGE 3] Skipping geocoding (type={item_type})")

    # --- Stage 4: Supabase insert ---
    payload = {
        "type": item_type,
        "title": extracted_data.get("title", "Untitled Item"),
        "thumbnail_url": thumbnail_url,
        "context_tags": extracted_data.get("context_tags", []),
        "original_url": url or "",
        "specific_data": specific_data
    }

    print(f"[STAGE 4] Inserting into Supabase: {json.dumps(payload, indent=2)}")

    try:
        if supabase:
            response = supabase.table("culinary_items").insert(payload).execute()
            if response.data:
                payload = response.data[0]
                print(f"[STAGE 4] ✅ Supabase insert success. Row id={payload.get('id')}")
        else:
            print("[STAGE 4] ℹ️  Supabase not configured — simulating DB save.")

        pin_resolved = (
            item_type == "PLACE"
            and specific_data.get("location", {}).get("lat", 0.0) != 0.0
        )

        if pin_resolved:
            send_telegram_message(chat_id, f"✅ Saved: {payload['title']} ({item_type}) 📍 Map Pin Resolved")
        else:
            send_telegram_message(chat_id, f"✅ Saved: {payload['title']} ({item_type})")

        print(f"[DONE] Pipeline completed for '{payload['title']}'\n{'='*60}\n")

    except Exception as e:
        print(f"[STAGE 4] ❌ DB error: {e}")
        send_telegram_message(chat_id, "❌ Failed to save to Supabase Database.")
        return jsonify({"status": "error"}), 500

    return jsonify({"status": "success", "data": payload}), 200


@app.route('/api/setup', methods=['GET'])
def setup_webhook():
    """Dev helper: registers the Telegram webhook via ?url= query param."""
    webhook_url = request.args.get('url')
    if not webhook_url:
        return jsonify({"error": "Provide ?url=https://your-ngrok-url.ngrok-free.app/api/webhook"}), 400

    if not TELEGRAM_BOT_TOKEN:
        return jsonify({"error": "TELEGRAM_BOT_TOKEN is missing from .env"}), 500

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/setWebhook?url={webhook_url}"
    try:
        res = requests.get(url).json()
        print(f"[SETUP] Webhook registration response: {res}")
        return jsonify(res), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/webhook/info', methods=['GET'])
def webhook_info():
    """Dev helper: returns the current Telegram webhook config."""
    if not TELEGRAM_BOT_TOKEN:
        return jsonify({"error": "TELEGRAM_BOT_TOKEN is missing from .env"}), 500
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getWebhookInfo"
    try:
        return jsonify(requests.get(url).json()), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 8000))
    print(f"\n🚀 CLR Backend starting on http://0.0.0.0:{port}")
    print(f"   Groq client:    {'✅ ready' if groq_client else '❌ missing GROQ_API_KEY'}")
    print(f"   Supabase client:{'✅ ready' if supabase else '❌ missing SUPABASE_URL/KEY'}")
    print(f"   Maps API key:   {'✅ set' if MAPS_API_KEY else '❌ missing MAPS_API_KEY'}")
    print(f"   Telegram token: {'✅ set' if TELEGRAM_BOT_TOKEN else '❌ missing TELEGRAM_BOT_TOKEN'}\n")
    app.run(host='0.0.0.0', port=port, debug=True)
