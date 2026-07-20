import os
import re
import json
import base64
import html as _html
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

# Comma-separated list of origins allowed to call this API via CORS.
# When unset (e.g. local dev) CORS falls back to permissive "*".
ALLOWED_ORIGINS = [o.strip() for o in (os.getenv("ALLOWED_ORIGINS") or "").split(",") if o.strip()]

MODELS_TO_TRY = [
    "llama-3.3-70b-versatile",   # Primary – High Intelligence
    "llama-3.1-70b-versatile",   # Backup A – High Reliability
    "llama-3.1-8b-instant",      # Backup B – High Speed/Availability
]

# Voice transcription + image understanding (Groq). Model names change over
# time, so they're env-overridable and the vision path tries several in order.
TRANSCRIBE_MODEL = os.getenv("GROQ_TRANSCRIBE_MODEL", "whisper-large-v3")
VISION_MODELS = [m.strip() for m in os.getenv(
    "GROQ_VISION_MODELS",
    "meta-llama/llama-4-scout-17b-16e-instruct,"
    "meta-llama/llama-4-maverick-17b-128e-instruct,"
    "llama-3.2-90b-vision-preview,"
    "llama-3.2-11b-vision-preview",
).split(",") if m.strip()]

# Initialize Services
groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None
supabase: Client | None = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None


# Allow the frontend (different origin) to call /api/link/start.
@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin", "")
    if ALLOWED_ORIGINS:
        # Restrict to the configured allowlist; echo back the origin if it matches.
        if origin in ALLOWED_ORIGINS:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Vary"] = "Origin"
    else:
        # No allowlist configured (e.g. local dev) — allow any origin.
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


def send_message(chat_id, text, reply_markup=None, parse_mode=None):
    """Send a Telegram message and return its message_id (or None).

    Optional inline keyboard (reply_markup) and parse_mode ("HTML"). If an
    HTML send fails (e.g. bad entity), retry once as plain text so the user
    still receives the message.
    """
    payload = {"chat_id": chat_id, "text": text}
    if parse_mode:
        payload["parse_mode"] = parse_mode
    if reply_markup is not None:
        payload["reply_markup"] = reply_markup
    res = telegram_request("sendMessage", payload)
    if res and res.get("ok"):
        return res.get("result", {}).get("message_id")
    if parse_mode:  # fallback to plain text
        res = telegram_request("sendMessage", {"chat_id": chat_id, "text": text})
        if res and res.get("ok"):
            return res.get("result", {}).get("message_id")
    return None


def edit_message(chat_id, message_id, text, reply_markup=None, parse_mode=None):
    if message_id is None:
        return send_message(chat_id, text, reply_markup=reply_markup, parse_mode=parse_mode)
    payload = {"chat_id": chat_id, "message_id": message_id, "text": text}
    if parse_mode:
        payload["parse_mode"] = parse_mode
    if reply_markup is not None:
        payload["reply_markup"] = reply_markup
    res = telegram_request("editMessageText", payload)
    if res is None and parse_mode:  # fallback to plain text
        telegram_request("editMessageText", {"chat_id": chat_id, "message_id": message_id, "text": text})


def send_chat_action(chat_id, action="typing"):
    """Show a transient 'typing…' indicator. Best-effort; failures are ignored."""
    telegram_request("sendChatAction", {"chat_id": chat_id, "action": action})


def answer_callback_query(callback_query_id, text=""):
    """Dismiss the loading spinner after an inline-button tap (optional toast)."""
    telegram_request("answerCallbackQuery", {"callback_query_id": callback_query_id, "text": text})


def remove_inline_keyboard(chat_id, message_id):
    """Strip a message's inline buttons so they can't be tapped again."""
    telegram_request("editMessageReplyMarkup", {"chat_id": chat_id, "message_id": message_id})


def set_my_commands(commands):
    """Register the '/' command palette (run once, not per request)."""
    return telegram_request("setMyCommands", {"commands": commands})


def esc(s):
    """Escape dynamic text for Telegram HTML parse_mode."""
    return _html.escape(str(s if s is not None else ""))


# Slash-command menu shown in Telegram's "/" palette.
BOT_COMMANDS = [
    {"command": "help", "description": "What I can do & how to link this chat"},
    {"command": "list", "description": "Your last 5 saved items"},
    {"command": "undo", "description": "Remove your last saved item"},
]

_commands_registered = False


def ensure_commands_registered():
    """Register the command menu once per process (lazily, on first update)."""
    global _commands_registered
    if _commands_registered:
        return
    _commands_registered = True
    try:
        set_my_commands(BOT_COMMANDS)
    except Exception as e:
        print(f"[commands] register error: {e}")


# Kept for backwards-compat with any other callers.
def send_telegram_message(chat_id, text):
    return send_message(chat_id, text)


# ---------- Voice / photo input ----------

def download_telegram_file(file_id):
    """Resolve a Telegram file_id and return its raw bytes (or None)."""
    if not TELEGRAM_BOT_TOKEN or not file_id:
        return None
    try:
        info = telegram_request("getFile", {"file_id": file_id})
        if not info or not info.get("ok"):
            return None
        file_path = info["result"]["file_path"]
        r = requests.get(
            f"https://api.telegram.org/file/bot{TELEGRAM_BOT_TOKEN}/{file_path}",
            timeout=20,
        )
        return r.content if r.ok else None
    except Exception as e:
        print(f"[tg file] {e}")
        return None


def transcribe_voice(file_id):
    """Transcribe a Telegram voice note via Groq Whisper. Returns text or ''."""
    if not groq_client:
        return ""
    audio = download_telegram_file(file_id)
    if not audio:
        return ""
    try:
        res = groq_client.audio.transcriptions.create(
            model=TRANSCRIBE_MODEL,
            file=("voice.ogg", audio),
        )
        return (getattr(res, "text", "") or "").strip()
    except Exception as e:
        print(f"[transcribe] {e}")
        return ""


def describe_photo(photo_sizes, caption=""):
    """Describe a food/place/recipe/gear photo as a short note via Groq vision.

    Returns a text description (fed into the normal extraction pipeline) or ''.
    """
    if not groq_client or not photo_sizes:
        return ""
    file_id = (photo_sizes[-1] or {}).get("file_id")  # last size is the largest
    img = download_telegram_file(file_id)
    if not img:
        return ""
    b64 = base64.b64encode(img).decode("ascii")
    hint = f' The user also wrote: "{caption}".' if caption else ""
    prompt = (
        "This photo was sent to a personal culinary catalog bot. In 1-3 sentences, "
        "describe what it shows as a note the bot can save: a restaurant / bar / cafe "
        "(include the name if a sign or menu is visible), a dish or recipe, or a piece "
        "of kitchen gear. Mention any readable name, place, cuisine, or dish." + hint
    )
    for model in VISION_MODELS:
        try:
            res = groq_client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                ]}],
                temperature=0.3,
            )
            out = (res.choices[0].message.content or "").strip()
            if out:
                return out
        except Exception as e:
            print(f"[vision {model}] {e}")
    return ""


# ---------- URL / scraping / geocoding ----------

def extract_url(text):
    urls = re.findall(r'(https?://[^\s]+)', text)
    return urls[0] if urls else None

# Curated, on-theme fallback imagery. These are direct Unsplash CDN asset URLs
# (NOT the retired source.unsplash.com dynamic endpoint) reused from the app's own
# mock data, so they are known to render reliably.
_UNSPLASH = "https://images.unsplash.com/photo-{id}?q=80&w=1600&auto=format&fit=crop"
FALLBACK_IMAGES = {
    "PLACE": [
        _UNSPLASH.format(id="1514933651103-005eec06c04b"),   # warm restaurant
        _UNSPLASH.format(id="1600891964092-4316c288032e"),   # brasserie / dining room
        _UNSPLASH.format(id="1550966871-3ed3cdb5ed0c"),      # fine dining
        _UNSPLASH.format(id="1555939594-58d7cb561ad1"),      # casual eatery
    ],
    "RECIPE": [
        _UNSPLASH.format(id="1600891963951-460d3d57d76f"),   # plated dish
        _UNSPLASH.format(id="1628169125139-4bb42fcadfc3"),   # appetizer
    ],
    "GEAR": [
        _UNSPLASH.format(id="1584803735147-19612c75a40a"),   # cast iron skillet
        _UNSPLASH.format(id="1579888944594-39c28892d5c3"),   # kitchen gadget
    ],
}

# Generic, always-working "no image yet" sentinel (used as a marker AND a safe
# last-resort image). Matches the food fallback used by the TS dev server.
PLACEHOLDER_IMG = _UNSPLASH.format(id="1498837167922-41c46b3f6162")


def get_fallback_image(title, tags, item_type):
    """Return an on-theme, reliably-rendering image when no scraped/Places photo exists.

    Picks deterministically from FALLBACK_IMAGES so the same item always gets the same
    image. `tags` is accepted for backwards-compatibility but no longer used for lookup.
    """
    options = FALLBACK_IMAGES.get(item_type) or FALLBACK_IMAGES["PLACE"]
    # Stable index: Python's built-in hash() of a str is per-process salted, so derive
    # our own deterministic value from the title instead.
    idx = sum(ord(c) for c in (title or "")) % len(options)
    fallback_url = options[idx]
    print(f"[fallback] Using curated {item_type} fallback image: {fallback_url}")
    return fallback_url



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
                    "body_excerpt": "",
                    "site_name": site_name,
                }
    except Exception as e:
        print(f"Microlink API error for {url}: {e}")

    try:
        return _scrape_with_beautifulsoup(url)
    except Exception as e:
        print(f"Fallback scraping error for {url}: {e}")
        return {
            "thumbnail_url": PLACEHOLDER_IMG,
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
    """Look up a place via Google Places Text Search → Place Details."""
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
    # Accept the link token however it arrives: "/start link_<tok>", a bare
    # "link_<tok>", or the two split across whitespace/newlines by copy-paste.
    m = re.search(r'link_([A-Za-z0-9_\-]+)', text)
    token = m.group(1) if m else ""
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
    "Send me a URL (Instagram, TikTok, article, Maps link), a text note, a 🎤 voice "
    "message, or a 🖼️ photo — I'll extract the place / recipe / gear and let you "
    "confirm before saving it to your repository.\n\n"
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
    except Exception as e:
        print(f"[undo] {e}")
        send_message(chat_id, "❌ Couldn't fetch your last item.")
        return
    if not res.data:
        send_message(chat_id, "Nothing to undo.")
        return
    last = res.data[0]
    # Two-step confirm: deleting is destructive, so ask first.
    keyboard = {"inline_keyboard": [[
        {"text": "🗑️ Delete", "callback_data": f"rm:{last['id']}"},
        {"text": "Cancel", "callback_data": "cancel"},
    ]]}
    send_message(
        chat_id,
        f"Remove your last item — <b>{esc(last['title'])}</b>?",
        reply_markup=keyboard,
        parse_mode="HTML",
    )


def create_pending_item(telegram_id, user_id, payload):
    """Stash a parsed item awaiting the user's Save/Discard. Returns its id, or
    None if the pending_items table isn't available (migration 004 not run)."""
    if not supabase:
        return None
    try:
        # Keep only the latest preview per chat.
        supabase.table("pending_items").delete().eq("telegram_id", telegram_id).execute()
        res = supabase.table("pending_items").insert({
            "telegram_id": telegram_id,
            "user_id": user_id,
            "payload": payload,
        }).execute()
        return res.data[0]["id"] if res.data else None
    except Exception as e:
        print(f"[pending] unavailable (run migration 004_pending_items.sql?): {e}")
        return None


def format_preview(payload):
    """Human-readable preview of a parsed item for the confirm step."""
    title = payload.get("title", "Untitled")
    itype = payload.get("type", "PLACE")
    sd = payload.get("specific_data", {}) or {}
    desc = (sd.get("short_description") or sd.get("description") or "").strip()
    tags = payload.get("context_tags", []) or []
    lines = [f"🔎 <b>{esc(title)}</b>  ·  {esc(itype.title())}"]
    if desc:
        lines.append(esc(desc[:220]))
    loc = sd.get("location") or {}
    if itype == "PLACE" and isinstance(loc, dict) and loc.get("address"):
        lines.append(f"📍 {esc(loc['address'])}")
    if tags:
        lines.append("🏷️ " + esc(", ".join(str(t) for t in tags[:6])))
    lines.append("\nSave this to your repository?")
    return "\n".join(lines)


def handle_callback_query(cq):
    """Handle inline-button taps: save/discard a preview, remove an item, cancel."""
    cq_id = cq.get("id")
    data = (cq.get("data") or "").strip()
    msg = cq.get("message") or {}
    chat_id = (msg.get("chat") or {}).get("id")
    message_id = msg.get("message_id")
    telegram_id = (cq.get("from") or {}).get("id")

    if data == "cancel":
        answer_callback_query(cq_id, "Cancelled")
        if chat_id and message_id:
            edit_message(chat_id, message_id, "✖️ Cancelled.")
        return

    # Preview → Save: move the pending item into the repository.
    if data.startswith("save:"):
        pid = data[5:]
        user_id = get_user_id_for_telegram(telegram_id)
        if not user_id:
            answer_callback_query(cq_id, "This chat isn't linked.")
            return
        try:
            found = supabase.table("pending_items").select("payload").eq("id", pid).eq("user_id", user_id).execute()
            if not found.data:
                answer_callback_query(cq_id, "This preview expired")
                if chat_id and message_id:
                    edit_message(chat_id, message_id, "⌛ This preview expired — send it again.")
                return
            item_payload = found.data[0]["payload"]
            inserted = supabase.table("culinary_items").insert(item_payload).execute()
            supabase.table("pending_items").delete().eq("id", pid).execute()
            saved = inserted.data[0] if inserted.data else item_payload
            item_id = saved.get("id")
            title = saved.get("title", "item")
            itype = saved.get("type", "PLACE")
            answer_callback_query(cq_id, "Saved ✓")
            keyboard = (
                {"inline_keyboard": [[{"text": "❌ Remove", "callback_data": f"rm:{item_id}"}]]}
                if item_id else None
            )
            if chat_id and message_id:
                edit_message(chat_id, message_id, f"✅ Saved <b>{esc(title)}</b> ({esc(str(itype).title())})",
                             reply_markup=keyboard, parse_mode="HTML")
        except Exception as e:
            print(f"[callback save] {e}")
            answer_callback_query(cq_id, "Couldn't save it")
        return

    # Preview → Discard: drop the pending item without saving.
    if data.startswith("disc:"):
        pid = data[5:]
        user_id = get_user_id_for_telegram(telegram_id)
        try:
            if user_id:
                supabase.table("pending_items").delete().eq("id", pid).eq("user_id", user_id).execute()
        except Exception as e:
            print(f"[callback disc] {e}")
        answer_callback_query(cq_id, "Discarded")
        if chat_id and message_id:
            edit_message(chat_id, message_id, "🗑️ Discarded — nothing saved.")
        return

    if data.startswith("rm:"):
        item_id = data[3:]
        user_id = get_user_id_for_telegram(telegram_id)
        if not user_id:
            answer_callback_query(cq_id, "This chat isn't linked.")
            return
        try:
            # Scope by user_id so a tap can only remove the caller's own item.
            found = (
                supabase.table("culinary_items")
                .select("title")
                .eq("id", item_id).eq("user_id", user_id).execute()
            )
            if not found.data:
                answer_callback_query(cq_id, "Already removed")
                if chat_id and message_id:
                    remove_inline_keyboard(chat_id, message_id)
                return
            title = found.data[0].get("title", "item")
            supabase.table("culinary_items").delete().eq("id", item_id).eq("user_id", user_id).execute()
            answer_callback_query(cq_id, "Removed ✓")
            if chat_id and message_id:
                edit_message(chat_id, message_id, f"🗑️ Removed <b>{esc(title)}</b>.", parse_mode="HTML")
        except Exception as e:
            print(f"[callback rm] {e}")
            answer_callback_query(cq_id, "Couldn't remove it")
        return

    answer_callback_query(cq_id)


# ---------- Routes ----------

@app.route('/', methods=['GET'])
def health_check():
    return jsonify({"status": "CLR Backend is running"}), 200


@app.route('/api/link/start', methods=['POST', 'OPTIONS'])
def link_start():
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
    update = request.get_json()
    if not update:
        return jsonify({"status": "ignored"}), 200

    ensure_commands_registered()

    # Inline-button taps (confirm / remove / cancel).
    if "callback_query" in update:
        handle_callback_query(update["callback_query"])
        return jsonify({"status": "ok"}), 200

    if "message" not in update:
        return jsonify({"status": "ignored"}), 200

    message = update["message"]
    chat_id = message["chat"]["id"]
    text = (message.get("text") or "").strip()
    telegram_id = message["from"]["id"]

    # A linking token (link_<random>) may arrive as "/start link_x", a bare
    # "link_x", or split across lines by copy-paste — match it anywhere.
    if re.search(r'link_[A-Za-z0-9_\-]{20,}', text):
        handle_link_command(message, chat_id, text)
        return jsonify({"status": "ok"}), 200

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

    # Voice note / photo → derive a text note, then process it like any other.
    if not text and (message.get("voice") or message.get("photo")):
        if not user_id:
            send_message(
                chat_id,
                "🔗 This chat isn't linked yet. Open the web app and click "
                "'Connect Telegram' first."
            )
            return jsonify({"status": "not_linked"}), 200
        send_chat_action(chat_id, "typing")
        if message.get("voice"):
            notice = send_message(chat_id, "🎤 Transcribing your voice note...")
            text = transcribe_voice(message["voice"].get("file_id"))
            if not text:
                edit_message(chat_id, notice, "❌ Couldn't transcribe that — try again or send text.")
                return jsonify({"status": "error"}), 200
            edit_message(chat_id, notice, f"🎤 Heard: “{esc(text[:200])}”", parse_mode="HTML")
        else:  # photo
            caption = (message.get("caption") or "").strip()
            notice = send_message(chat_id, "🖼️ Looking at your photo...")
            described = describe_photo(message.get("photo") or [], caption)
            if not described:
                edit_message(chat_id, notice, "❌ Couldn't read that image — add a caption or send a text note.")
                return jsonify({"status": "error"}), 200
            text = (caption + "\n" + described).strip() if caption else described
            edit_message(chat_id, notice, "🖼️ Got it — extracting...")

    if not text:
        send_message(chat_id, "⚠️ Send me a URL, a text note, a voice message, or a photo.")
        return jsonify({"status": "ignored"}), 200

    if not user_id:
        send_message(
            chat_id,
            "🔗 This chat isn't linked to an account yet.\n\n"
            "Open the web app, sign in, and click 'Connect Telegram' to start saving items."
        )
        return jsonify({"status": "not_linked"}), 200

    send_chat_action(chat_id, "typing")
    progress_id = send_message(chat_id, "🔍 Processing your culinary intel...")

    def progress(t):
        send_chat_action(chat_id, "typing")
        edit_message(chat_id, progress_id, t)

    url = extract_url(text)
    scraped = {
        "thumbnail_url": PLACEHOLDER_IMG,
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
                    photos.insert(0, p)
        if loc.get("address") and (not loc.get("lat") or loc["lat"] == 0):
            progress("📍 Resolving location on map...")
            lat, lng, fmt_address = geocode_address(loc["address"])
            loc["lat"] = lat
            loc["lng"] = lng
            loc["address"] = fmt_address

    if photos:
        specific_data["photos"] = photos[:8]

    # Evaluate thumbnail_url: Use photos[0] (which may be from Places API) or scraped valid image
    base_thumbnail = photos[0] if photos else scraped.get("thumbnail_url")
    if not base_thumbnail or base_thumbnail == PLACEHOLDER_IMG:
        thumbnail_url = get_fallback_image(extracted_data.get("title"), extracted_data.get("context_tags", []), item_type)
        if thumbnail_url and thumbnail_url not in photos:
            photos.insert(0, thumbnail_url)
            specific_data["photos"] = photos[:8]
    else:
        thumbnail_url = base_thumbnail

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
    
    short_description = (extracted_data.get("short_description") or "").strip()
    if short_description:
        specific_data["short_description"] = short_description

    # Preview-before-save: stash the parse and let the user confirm. Falls back
    # to immediate save below if pending_items isn't available (migration 004).
    pending_id = create_pending_item(telegram_id, user_id, payload) if supabase else None
    if pending_id:
        edit_message(
            chat_id, progress_id, format_preview(payload),
            reply_markup={"inline_keyboard": [[
                {"text": "✅ Save", "callback_data": f"save:{pending_id}"},
                {"text": "❌ Discard", "callback_data": f"disc:{pending_id}"},
            ]]},
            parse_mode="HTML",
        )
        return jsonify({"status": "pending", "pending_id": pending_id}), 200

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
    item_id = payload.get("id")
    has_pin = (
        item_type == "PLACE"
        and isinstance(payload.get("specific_data", {}).get("location"), dict)
        and payload["specific_data"]["location"].get("lat", 0) != 0
    )
    pin = " 📍" if has_pin else ""
    saved_text = f"✅ Saved <b>{esc(title)}</b> ({esc(item_type.title())}){pin}"
    # Single-use "Remove" button lets the user reject a bad extraction inline.
    keyboard = (
        {"inline_keyboard": [[{"text": "❌ Remove", "callback_data": f"rm:{item_id}"}]]}
        if item_id else None
    )
    edit_message(chat_id, progress_id, saved_text, reply_markup=keyboard, parse_mode="HTML")
    return jsonify({"status": "success", "data": payload}), 200


@app.route('/api/setup', methods=['GET'])
def setup_webhook():
    webhook_url = request.args.get('url')
    if not webhook_url:
        return jsonify({"error": "Provide ?url=https://your-domain.com/api/webhook"}), 400
    if not TELEGRAM_BOT_TOKEN:
        return jsonify({"error": "TELEGRAM_BOT_TOKEN is missing"}), 500
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/setWebhook?url={webhook_url}"
    try:
        res = requests.get(url).json()
        # Also (re)register the slash-command menu while we're configuring.
        try:
            set_my_commands(BOT_COMMANDS)
        except Exception as e:
            print(f"[setup] set_my_commands error: {e}")
        return jsonify(res), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 8000))
    app.run(host='0.0.0.0', port=port, debug=True)
