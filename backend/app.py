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


PLACEHOLDER_IMG = "https://via.placeholder.com/400?text=No+Thumbnail"


def _scrape_with_beautifulsoup(url):
    """Direct fetch + BS4 parse. Returns a rich dict."""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                      'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    response = requests.get(url, headers=headers, timeout=8)
    soup = BeautifulSoup(response.text, 'html.parser')

    def meta(prop=None, name=None):
        tag = soup.find('meta', property=prop) if prop else soup.find('meta', attrs={'name': name})
        return (tag.get('content') or "").strip() if tag else ""

    title = meta(prop='og:title') or (soup.title.string.strip() if soup.title and soup.title.string else "Unknown Title")
    description = meta(prop='og:description') or meta(name='description')
    site_name = meta(prop='og:site_name')
    primary_image = meta(prop='og:image') or meta(name='twitter:image')

    images = []
    for tag in soup.find_all('meta', property='og:image'):
        u = (tag.get('content') or "").strip()
        if u and u not in images:
            images.append(u)
    if primary_image and primary_image not in images:
        images.insert(0, primary_image)

    body_excerpt = ""
    for selector in ['article', 'main', 'div[itemprop="articleBody"]']:
        node = soup.select_one(selector)
        if node:
            body_excerpt = " ".join(node.get_text(" ", strip=True).split())[:2000]
            break
    if not body_excerpt:
        text = soup.get_text(" ", strip=True)
        body_excerpt = " ".join(text.split())[:2000]

    return {
        "thumbnail_url": primary_image or PLACEHOLDER_IMG,
        "images": images,
        "title": title,
        "description": description,
        "body_excerpt": body_excerpt,
        "site_name": site_name,
    }


def scrape_metadata(url):
    """Scrape page metadata via Microlink (rich) with a BeautifulSoup fallback.

    Returns a dict with keys: thumbnail_url, images[], title, description,
    body_excerpt, site_name.
    """
    # Try Microlink first — handles JS-rendered pages and Instagram/TikTok.
    try:
        microlink_url = f"https://api.microlink.io?url={urllib.parse.quote(url, safe='')}&audio=false&video=false&meta=true"
        response = requests.get(microlink_url, timeout=12)
        if response.status_code == 200:
            res_json = response.json()
            if res_json.get('status') == 'success':
                data = res_json.get('data', {})
                title = data.get('title') or "Unknown Title"
                description = data.get('description') or ""
                site_name = data.get('publisher') or data.get('author') or ""

                image_data = data.get('image')
                thumbnail_url = ""
                if isinstance(image_data, dict):
                    thumbnail_url = image_data.get('url', "")
                elif isinstance(image_data, str):
                    thumbnail_url = image_data
                thumbnail_url = thumbnail_url or PLACEHOLDER_IMG

                images = [thumbnail_url] if thumbnail_url and thumbnail_url != PLACEHOLDER_IMG else []
                logo = data.get('logo')
                if isinstance(logo, dict) and logo.get('url') and logo['url'] not in images:
                    images.append(logo['url'])

                return {
                    "thumbnail_url": thumbnail_url,
                    "images": images,
                    "title": title,
                    "description": description,
                    "body_excerpt": "",  # Microlink doesn't return body
                    "site_name": site_name,
                }
    except Exception as e:
        print(f"Microlink API error for {url}: {e}")

    try:
        return _scrape_with_beautifulsoup(url)
    except Exception as e:
        print(f"Fallback scraping error for {url}: {e}")
        return {
            "thumbnail_url": "https://via.placeholder.com/400?text=Extraction+Failed",
            "images": [],
            "title": "Unknown Title",
            "description": "",
            "body_excerpt": "",
            "site_name": "",
        }


# ---------- Google Places enrichment ----------

PLACES_FIELDS = (
    "place_id,name,formatted_address,geometry,rating,user_ratings_total,"
    "price_level,website,formatted_phone_number,international_phone_number,"
    "opening_hours,types,business_status,url,editorial_summary,photos"
)


def google_places_enrich(query, location_hint=""):
    """Look up a place via Google Places Text Search → Place Details.

    Returns a dict with rich place data (or {} on failure). Uses MAPS_API_KEY,
    which must have the Places API enabled.
    """
    if not MAPS_API_KEY or not query:
        return {}

    try:
        search_q = f"{query} {location_hint}".strip()
        search_url = (
            "https://maps.googleapis.com/maps/api/place/textsearch/json"
            f"?query={urllib.parse.quote(search_q)}&key={MAPS_API_KEY}"
        )
        sr = requests.get(search_url, timeout=6).json()
        if sr.get("status") != "OK" or not sr.get("results"):
            return {}
        place_id = sr["results"][0]["place_id"]

        details_url = (
            "https://maps.googleapis.com/maps/api/place/details/json"
            f"?place_id={place_id}&fields={PLACES_FIELDS}&key={MAPS_API_KEY}"
        )
        dr = requests.get(details_url, timeout=6).json()
        if dr.get("status") != "OK":
            return {}
        result = dr.get("result", {}) or {}

        photo_urls = []
        for p in (result.get("photos") or [])[:6]:
            ref = p.get("photo_reference")
            if ref:
                photo_urls.append(
                    "https://maps.googleapis.com/maps/api/place/photo"
                    f"?maxwidth=1200&photo_reference={ref}&key={MAPS_API_KEY}"
                )

        loc = (result.get("geometry") or {}).get("location") or {}
        oh = result.get("opening_hours") or {}

        return {
            "place_id": result.get("place_id", ""),
            "name": result.get("name", ""),
            "address": result.get("formatted_address", ""),
            "lat": loc.get("lat", 0.0),
            "lng": loc.get("lng", 0.0),
            "rating": result.get("rating"),
            "ratings_count": result.get("user_ratings_total"),
            "price_level": result.get("price_level"),
            "website": result.get("website", ""),
            "phone": result.get("formatted_phone_number", "")
                     or result.get("international_phone_number", ""),
            "google_maps_url": result.get("url", ""),
            "types": result.get("types", []),
            "business_status": result.get("business_status", ""),
            "editorial_summary": ((result.get("editorial_summary") or {}).get("overview") or ""),
            "hours_summary": "; ".join(oh.get("weekday_text", []) or []),
            "open_now": oh.get("open_now"),
            "photos": photo_urls,
        }
    except Exception as e:
        print(f"[places] enrich error: {e}")
        return {}


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

    # Require a linked account: items are now per-user, so an unlinked chat
    # has nowhere to save the item.
    if not user_id:
        send_message(
            chat_id,
            "🔗 This chat isn't linked to an account yet.\n\n"
            "Open the web app, sign in, and click 'Connect Telegram' to start saving items."
        )
        return jsonify({"status": "not_linked"}), 200

    progress_id = send_message(chat_id, "🔍 Processing your culinary intel...")

    def progress(t):
        edit_message(chat_id, progress_id, t)

    url = extract_url(text)
    scraped = {
        "thumbnail_url": "https://via.placeholder.com/400?text=Text+Only",
        "images": [],
        "title": "",
        "description": "",
        "body_excerpt": "",
        "site_name": "",
    }
    if url:
        progress("📥 Scraping page metadata...")
        scraped = scrape_metadata(url)

    if not groq_client:
        progress("❌ AI service not configured.")
        return jsonify({"status": "error", "message": "Missing Groq configuration"}), 500

    # Pre-LLM Places enrichment: if the scraped title or user text looks like
    # a real place, hit Google Places now so the LLM can ground its description
    # in the authoritative facts (rating, phone, hours, photos).
    places_data = {}
    candidate_query = (scraped.get("title") or "").strip()
    if not candidate_query and text:
        candidate_query = text.strip().split("\n")[0][:120]
    looks_like_place = bool(candidate_query) and (
        not url
        or any(host in url for host in ("instagram.com", "tiktok.com", "google.com/maps", "maps.app.goo.gl", "wolt.com"))
        or (scraped.get("site_name", "") or "").lower() in {"instagram", "tiktok", "google maps"}
    )
    if looks_like_place:
        progress("🌐 Looking up place details on Google...")
        places_data = google_places_enrich(candidate_query)

    progress("🧠 Parsing with AI...")
    prompt = get_extraction_prompt(
        user_text=text,
        scraped_title=scraped.get("title", ""),
        scraped_caption=scraped.get("description", ""),
        scraped_body=scraped.get("body_excerpt", ""),
        scraped_site=scraped.get("site_name", ""),
        places_data=json.dumps(places_data, ensure_ascii=False) if places_data else "",
    )

    chat_completion = None
    for model in MODELS_TO_TRY:
        try:
            chat_completion = groq_client.chat.completions.create(
                messages=[
                    {"role": "system", "content": "You return only valid JSON objects matching the requested schema. No prose, no Markdown."},
                    {"role": "user", "content": prompt},
                ],
                model=model,
                temperature=0.3,
                response_format={"type": "json_object"},
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

    # Merge Google Places ground truth into the PLACE specific_data and prefer
    # Places photos (they're the high-quality, on-brand ones).
    photos = []
    if scraped.get("images"):
        photos.extend(scraped["images"])

    if item_type == "PLACE":
        loc = specific_data.setdefault("location", {"address": "", "lat": 0.0, "lng": 0.0})
        if places_data:
            if places_data.get("address"):
                loc["address"] = places_data["address"]
            loc["lat"] = places_data.get("lat", loc.get("lat", 0.0))
            loc["lng"] = places_data.get("lng", loc.get("lng", 0.0))
            specific_data["google_maps_url"] = places_data.get("google_maps_url", "") or specific_data.get("google_maps_url", "")
            specific_data["website"] = specific_data.get("website") or places_data.get("website", "")
            specific_data["phone"] = specific_data.get("phone") or places_data.get("phone", "")
            specific_data["hours_summary"] = specific_data.get("hours_summary") or places_data.get("hours_summary", "")
            specific_data["rating"] = places_data.get("rating")
            specific_data["ratings_count"] = places_data.get("ratings_count")
            if places_data.get("price_level") is not None and not specific_data.get("price_range"):
                specific_data["price_range"] = "$" * int(places_data["price_level"]) if places_data["price_level"] else ""
            for p in places_data.get("photos", []):
                if p not in photos:
                    photos.insert(0, p)  # Places photos preferred as primary
        if loc.get("address") and (not loc.get("lat") or loc["lat"] == 0):
            progress("📍 Resolving location on map...")
            lat, lng, fmt_address = geocode_address(loc["address"])
            loc["lat"] = lat
            loc["lng"] = lng
            loc["address"] = fmt_address

    if photos:
        specific_data["photos"] = photos[:8]

    thumbnail_url = (photos[0] if photos else scraped.get("thumbnail_url")) or PLACEHOLDER_IMG

    payload = {
        "type": item_type,
        "title": extracted_data.get("title", "Untitled Item"),
        "thumbnail_url": thumbnail_url,
        "context_tags": extracted_data.get("context_tags", []),
        "original_url": url or "",
        "specific_data": specific_data,
        "user_id": user_id,
    }
    description = (extracted_data.get("description") or "").strip()
    if description:
        specific_data["description"] = description

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
