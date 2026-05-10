import os
import re
import json
import secrets
import urllib.parse
from datetime import datetime, timedelta, timezone
import requests
from bs4 import BeautifulSoup
from flask import Flask, request, jsonify
from groq import Groq
from supabase import create_client, Client
from dotenv import load_dotenv

from prompts import get_extraction_prompt

load_dotenv()

app = Flask(__name__)

# Keys & Config
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_BOT_USERNAME = (os.getenv("TELEGRAM_BOT_USERNAME") or "").strip().lstrip("@")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
MAPS_API_KEY = os.getenv("MAPS_API_KEY")
SUPABASE_URL = (os.getenv("SUPABASE_URL") or "").strip().rstrip("/")
SUPABASE_KEY = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()

MODELS_TO_TRY = [
    "llama-3.3-70b-versatile",   # Primary – High Intelligence
    "llama-3.1-70b-versatile",   # Backup A – High Reliability
    "llama-3.1-8b-instant",      # Backup B – High Speed/Availability
]

# Initialize Services
groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None
supabase: Client | None = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None


# Allow the frontend (different origin) to call /api/link/start.
@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response


# ---------- Telegram helpers ----------

def telegram_request(method, payload):
    if not TELEGRAM_BOT_TOKEN:
        print(f"[telegram] no token; would call {method}: {payload}")
        return None
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/{method}"
    try:
        res = requests.post(url, json=payload, timeout=10)
        return res.json() if res.ok else None
    except Exception as e:
        print(f"[telegram] {method} error: {e}")
        return None


def send_message(chat_id, text):
    """Send a Telegram message and return its message_id (or None)."""
    res = telegram_request("sendMessage", {"chat_id": chat_id, "text": text})
    if res and res.get("ok"):
        return res.get("result", {}).get("message_id")
    return None


def edit_message(chat_id, message_id, text):
    if message_id is None:
        send_message(chat_id, text)
        return
    telegram_request("editMessageText", {
        "chat_id": chat_id,
        "message_id": message_id,
        "text": text,
    })


# Kept for backwards-compat with any other callers.
def send_telegram_message(chat_id, text):
    return send_message(chat_id, text)


# ---------- URL / scraping / geocoding ----------

def extract_url(text):
    urls = re.findall(r'(https?://[^\s]+)', text)
    return urls[0] if urls else None


def scrape_metadata(url):
    """Scrape OpenGraph metadata via Microlink with a BeautifulSoup fallback."""
    try:
        microlink_url = f"https://api.microlink.io?url={urllib.parse.quote(url, safe='')}"
        response = requests.get(microlink_url, timeout=10)
        if response.status_code == 200:
            res_json = response.json()
            if res_json.get('status') == 'success':
                data = res_json.get('data', {})
                title = data.get('title', "Unknown Title")
                description = data.get('description', "")
                image_data = data.get('image')
                thumbnail_url = ""
                if isinstance(image_data, dict):
                    thumbnail_url = image_data.get('url', "")
                elif isinstance(image_data, str):
                    thumbnail_url = image_data
                if not thumbnail_url:
                    thumbnail_url = "https://via.placeholder.com/400?text=No+Thumbnail"
                return thumbnail_url, title, description
    except Exception as e:
        print(f"Microlink API error for {url}: {e}")

    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'}
        response = requests.get(url, headers=headers, timeout=5)
        soup = BeautifulSoup(response.text, 'html.parser')
        og_image = soup.find('meta', property='og:image')
        og_title = soup.find('meta', property='og:title')
        og_desc = soup.find('meta', property='og:description')
        title = og_title.get('content') if og_title else soup.title.string if soup.title else "Unknown Title"
        description = og_desc.get('content') if og_desc else ""
        thumbnail_url = og_image.get('content') if og_image else "https://via.placeholder.com/400?text=No+Thumbnail"
        return thumbnail_url, title, description
    except Exception as e:
        print(f"Fallback scraping error for {url}: {e}")
        return "https://via.placeholder.com/400?text=Extraction+Failed", "Unknown Title", ""


def geocode_address(address):
    if not MAPS_API_KEY:
        print("Warning: MAPS_API_KEY not set. Skipping geocoding.")
        return 0.0, 0.0, address
    url = f"https://maps.googleapis.com/maps/api/geocode/json?address={address}&key={MAPS_API_KEY}"
    try:
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        res = response.json()
        if res.get('status') == 'OK' and len(res.get('results', [])) > 0:
            loc = res['results'][0]['geometry']['location']
            fmt_address = res['results'][0]['formatted_address']
            return loc['lat'], loc['lng'], fmt_address
        else:
            print(f"Geocoding Warning: API returned status {res.get('status')} for address '{address}'")
    except Exception as e:
        print(f"Geocoding Error: {e}")
    return 0.0, 0.0, address


# ---------- Telegram ↔ Supabase user linking ----------

def get_user_id_for_telegram(telegram_id):
    if not supabase:
        return None
    try:
        res = supabase.table("telegram_links").select("user_id").eq("telegram_id", telegram_id).execute()
        return res.data[0]["user_id"] if res.data else None
    except Exception as e:
        print(f"[link] lookup error: {e}")
        return None


def handle_link_command(message, chat_id, text):
    """Process /start link_<token> and bind this Telegram chat to a Supabase user."""
    token = text[len("/start link_"):].strip()
    telegram_id = message["from"]["id"]
    username = message["from"].get("username")

    if not supabase:
        send_message(chat_id, "❌ Server not configured.")
        return

    try:
        res = supabase.table("linking_tokens").select("*").eq("token", token).execute()
    except Exception as e:
        print(f"[link] db error: {e}")
        send_message(chat_id, "❌ Could not look up the link. Try again.")
        return

    if not res.data:
        send_message(chat_id, "❌ Invalid link. Generate a new one from the web app.")
        return

    row = res.data[0]
    expires_at = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) > expires_at:
        supabase.table("linking_tokens").delete().eq("token", token).execute()
        send_message(chat_id, "❌ Link expired (5 min). Generate a new one.")
        return

    try:
        supabase.table("telegram_links").upsert({
            "telegram_id": telegram_id,
            "user_id": row["user_id"],
            "username": username,
        }).execute()
        supabase.table("linking_tokens").delete().eq("token", token).execute()
    except Exception as e:
        print(f"[link] save error: {e}")
        send_message(chat_id, "❌ Failed to save the link. Try again.")
        return

    send_message(chat_id, "✅ Connected! Send me a URL or a text note and I'll save it to your repository.\n\nType /help to see all commands.")


# ---------- Slash commands ----------

HELP_TEXT = (
    "🍴 CLR Bot\n\n"
    "Send me a URL (Instagram, TikTok, article, Maps link) or a plain text note "
    "and I'll extract the place / recipe / gear and save it to your repository.\n\n"
    "Commands:\n"
    "• /list — your last 5 saved items\n"
    "• /undo — delete the last item you saved\n"
    "• /help — this message\n\n"
    "First time? Open the web app, sign in, and click 'Connect Telegram' to "
    "link this chat to your account."
)


def handle_help(chat_id):
    send_message(chat_id, HELP_TEXT)


def handle_list(chat_id, user_id):
    if not user_id:
        send_message(chat_id, "🔗 Not linked yet. Open the web app and click 'Connect Telegram' first.")
        return
    try:
        res = (
            supabase.table("culinary_items")
            .select("title,type,created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(5)
            .execute()
        )
    except Exception as e:
        print(f"[list] {e}")
        send_message(chat_id, "❌ Couldn't fetch your items.")
        return
    if not res.data:
        send_message(chat_id, "📭 No items yet. Send me a URL or a note to get started.")
        return
    lines = "\n".join(f"• {it['title']} — {it['type']}" for it in res.data)
    send_message(chat_id, f"📚 Last {len(res.data)}:\n\n{lines}")


def handle_undo(chat_id, user_id):
    if not user_id:
        send_message(chat_id, "🔗 Not linked yet.")
        return
    try:
        res = (
            supabase.table("culinary_items")
            .select("id,title")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if not res.data:
            send_message(chat_id, "Nothing to undo.")
            return
        last = res.data[0]
        supabase.table("culinary_items").delete().eq("id", last["id"]).execute()
        send_message(chat_id, f"🗑️ Deleted: {last['title']}")
    except Exception as e:
        print(f"[undo] {e}")
        send_message(chat_id, "❌ Couldn't delete the last item.")


# ---------- Routes ----------

@app.route('/', methods=['GET'])
def health_check():
    return jsonify({"status": "CLR Backend is running"}), 200


@app.route('/api/link/start', methods=['POST', 'OPTIONS'])
def link_start():
    """Frontend calls this with the user's Supabase JWT to mint a one-time
    deep-link token. Returns { token, expires_at, deep_link }."""
    if request.method == 'OPTIONS':
        return ('', 204)

    if not supabase:
        return jsonify({"error": "supabase not configured"}), 500
    if not TELEGRAM_BOT_USERNAME:
        return jsonify({"error": "TELEGRAM_BOT_USERNAME not configured on server"}), 500

    auth = request.headers.get('Authorization', '')
    if not auth.lower().startswith('bearer '):
        return jsonify({"error": "missing Authorization: Bearer <token>"}), 401
    jwt_token = auth[7:].strip()

    try:
        user_response = supabase.auth.get_user(jwt_token)
        user = user_response.user
        if not user:
            return jsonify({"error": "invalid token"}), 401
    except Exception as e:
        print(f"[link/start] jwt verify error: {e}")
        return jsonify({"error": "invalid token"}), 401

    token = secrets.token_urlsafe(24)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)

    try:
        supabase.table("linking_tokens").insert({
            "token": token,
            "user_id": user.id,
            "expires_at": expires_at.isoformat(),
        }).execute()
    except Exception as e:
        print(f"[link/start] insert error: {e}")
        return jsonify({"error": "could not create link token"}), 500

    return jsonify({
        "token": token,
        "expires_at": expires_at.isoformat(),
        "deep_link": f"https://t.me/{TELEGRAM_BOT_USERNAME}?start=link_{token}",
    }), 200


@app.route('/api/webhook', methods=['POST'])
def telegram_webhook():
    """Telegram update ingest."""
    update = request.get_json()
    if not update or "message" not in update:
        return jsonify({"status": "ignored"}), 200

    message = update["message"]
    chat_id = message["chat"]["id"]
    text = (message.get("text") or "").strip()
    telegram_id = message["from"]["id"]

    # Deep-link from website
    if text.startswith("/start link_"):
        handle_link_command(message, chat_id, text)
        return jsonify({"status": "ok"}), 200

    # Bare /start or /help
    if text in ("/start", "/help"):
        handle_help(chat_id)
        return jsonify({"status": "ok"}), 200

    user_id = get_user_id_for_telegram(telegram_id)

    if text == "/list":
        handle_list(chat_id, user_id)
        return jsonify({"status": "ok"}), 200

    if text == "/undo":
        handle_undo(chat_id, user_id)
        return jsonify({"status": "ok"}), 200

    # ---------- Item ingest pipeline ----------
    if not text:
        send_message(chat_id, "⚠️ Send me a URL or a text note.")
        return jsonify({"status": "ignored"}), 200

    progress_id = send_message(chat_id, "🔍 Processing your culinary intel...")

    def progress(t):
        edit_message(chat_id, progress_id, t)

    url = extract_url(text)
    thumbnail_url, scraped_title, scraped_caption = (
        "https://via.placeholder.com/400?text=Text+Only", "", ""
    )
    if url:
        progress("📥 Scraping page metadata...")
        thumbnail_url, scraped_title, scraped_caption = scrape_metadata(url)

    if not groq_client:
        progress("❌ AI service not configured.")
        return jsonify({"status": "error", "message": "Missing Groq configuration"}), 500

    progress("🧠 Parsing with AI...")
    prompt = get_extraction_prompt(text, scraped_title, scraped_caption)

    chat_completion = None
    for model in MODELS_TO_TRY:
        try:
            chat_completion = groq_client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model=model,
                temperature=0.1,
            )
            break
        except Exception as e:
            print(f"Groq model {model} failed: {e}")

    if chat_completion is None:
        progress("❌ All AI models are unavailable. Please try again in a minute.")
        return jsonify({"status": "error", "message": "All Groq models failed"}), 500

    raw_output = chat_completion.choices[0].message.content
    raw_output = raw_output.replace("```json", "").replace("```", "").strip()
    try:
        extracted_data = json.loads(raw_output)
    except json.JSONDecodeError as e:
        print(f"Groq JSON parsing error: {e}\nRaw output: {raw_output}")
        progress("❌ AI returned invalid data. Try rephrasing or send the URL directly.")
        return jsonify({"status": "error", "message": "Invalid JSON from LLM"}), 500

    item_type = extracted_data.get("type", "PLACE")
    specific_data = extracted_data.get("specific_data", {}) or {}

    if item_type == "PLACE" and "location" in specific_data:
        raw_address = specific_data["location"].get("address", "")
        if raw_address:
            progress("📍 Resolving location on map...")
            lat, lng, fmt_address = geocode_address(raw_address)
            specific_data["location"]["lat"] = lat
            specific_data["location"]["lng"] = lng
            specific_data["location"]["address"] = fmt_address

    payload = {
        "type": item_type,
        "title": extracted_data.get("title", "Untitled Item"),
        "thumbnail_url": thumbnail_url,
        "context_tags": extracted_data.get("context_tags", []),
        "original_url": url or "",
        "specific_data": specific_data,
    }
    if user_id:
        payload["user_id"] = user_id

    try:
        if supabase:
            response = supabase.table("culinary_items").insert(payload).execute()
            if response.data:
                payload = response.data[0]
        else:
            print(f"Simulating DB Save: {json.dumps(payload, indent=2, default=str)}")
    except Exception as e:
        print(f"DB Error: {e}")
        progress("❌ Couldn't save to the database. The bot is still online — try again.")
        return jsonify({"status": "error"}), 500

    title = payload.get("title", "Untitled Item")
    has_pin = (
        item_type == "PLACE"
        and isinstance(payload.get("specific_data", {}).get("location"), dict)
        and payload["specific_data"]["location"].get("lat", 0) != 0
    )
    progress(f"✅ Saved: {title} ({item_type}){' 📍' if has_pin else ''}")

    if not user_id:
        send_message(chat_id, "💡 Tip: open the web app and click 'Connect Telegram' to tag items as yours and unlock /list and /undo.")

    return jsonify({"status": "success", "data": payload}), 200


@app.route('/api/setup', methods=['GET'])
def setup_webhook():
    """Dev helper to register the Telegram webhook quickly."""
    webhook_url = request.args.get('url')
    if not webhook_url:
        return jsonify({"error": "Provide ?url=https://your-domain.com/api/webhook"}), 400
    if not TELEGRAM_BOT_TOKEN:
        return jsonify({"error": "TELEGRAM_BOT_TOKEN is missing"}), 500
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/setWebhook?url={webhook_url}"
    try:
        res = requests.get(url).json()
        return jsonify(res), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 8000))
    app.run(host='0.0.0.0', port=port, debug=True)
