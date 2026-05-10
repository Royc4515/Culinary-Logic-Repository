import os
import re
import json
import urllib.parse
import requests
from bs4 import BeautifulSoup
from flask import Flask, request, jsonify
from groq import Groq
from supabase import create_client, Client
from dotenv import load_dotenv

from prompts import get_extraction_prompt

# Load Environment Variables
load_dotenv()

app = Flask(__name__)

# Keys & Config
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
MAPS_API_KEY = os.getenv("MAPS_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

MODELS_TO_TRY = [
    "llama-3.3-70b-versatile",   # Primary – High Intelligence
    "llama-3.1-70b-versatile",   # Backup A – High Reliability
    "llama-3.1-8b-instant",      # Backup B – High Speed/Availability
]

# Initialize Services
groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None
supabase: Client | None = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

def send_telegram_message(chat_id, text):
    """Sends a message back to the user via Telegram."""
    if not TELEGRAM_BOT_TOKEN:
        print(f"Would send to Telegram: {text}")
        return
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {"chat_id": chat_id, "text": text}
    requests.post(url, json=payload)

def extract_url(text):
    """Extract the first HTTP URL from text."""
    urls = re.findall(r'(https?://[^\s]+)', text)
    return urls[0] if urls else None

def scrape_metadata(url):
    """Scrapes OpenGraph metadata from a URL using Microlink as a robust extraction API, with a fallback to basic requests."""
    try:
        # Use Microlink API to handle JS-rendered and anti-bot protected sites like Instagram/TikTok
        microlink_url = f"https://api.microlink.io?url={urllib.parse.quote(url, safe='')}"
        
        # Optional: Un-comment and use if you have a Microlink Pro plan
        # headers = {'x-api-key': os.getenv('MICROLINK_API_KEY')}
        # response = requests.get(microlink_url, headers=headers, timeout=10)
        
        response = requests.get(microlink_url, timeout=10)
        
        if response.status_code == 200:
            res_json = response.json()
            if res_json.get('status') == 'success':
                data = res_json.get('data', {})
                title = data.get('title', "Unknown Title")
                description = data.get('description', "")
                
                # Image could be a string or a dict
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

    # Fallback to standard requests + BeautifulSoup if Microlink fails or rate limits
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'}
        response = requests.get(url, headers=headers, timeout=5)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Check standard og: tags
        og_image = soup.find('meta', property='og:image')
        og_title = soup.find('meta', property='og:title')
        og_desc = soup.find('meta', property='og:description')
        
        # Fallbacks
        title = og_title.get('content') if og_title else soup.title.string if soup.title else "Unknown Title"
        description = og_desc.get('content') if og_desc else ""
        thumbnail_url = og_image.get('content') if og_image else "https://via.placeholder.com/400?text=No+Thumbnail"
        
        return thumbnail_url, title, description
    except Exception as e:
        print(f"Fallback scraping error for {url}: {e}")
        return "https://via.placeholder.com/400?text=Extraction+Failed", "Unknown Title", ""

def geocode_address(address):
    """Uses Google Maps Geocoding API to resolve address to coordinates."""
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
    except requests.exceptions.RequestException as e:
        print(f"Geocoding Network Error: {e}")
    except ValueError as e:
        print(f"Geocoding JSON Parsing Error: {e}")
    except Exception as e:
        print(f"Geocoding Unexpected Error: {e}")
        
    return 0.0, 0.0, address

@app.route('/', methods=['GET'])
def health_check():
    return jsonify({"status": "CLR Backend is running", "environment": "serverless"}), 200

@app.route('/api/webhook', methods=['POST'])
def telegram_webhook():
    """Main Telegram webhook ingest endpoint."""
    update = request.get_json()
    
    # Ignore unexpected payloads
    if not update or "message" not in update:
        return jsonify({"status": "ignored"}), 200
        
    message = update["message"]
    chat_id = message["chat"]["id"]
    text = message.get("text", "")
    
    # 1. Notify User we are processing
    send_telegram_message(chat_id, "🔍 Processing your culinary intel...")
    
    # 2. Extract Data
    url = extract_url(text)
    thumbnail_url, scraped_title, scraped_caption = ("https://via.placeholder.com/400?text=Text+Only", "", "")
    if url:
        thumbnail_url, scraped_title, scraped_caption = scrape_metadata(url)
    elif not text:
         send_telegram_message(chat_id, "⚠️ Please send a URL or text note.")
         return jsonify({"status": "ignored"}), 200

    # 3. LLM Parsing (Groq)
    if not groq_client:
        send_telegram_message(chat_id, "❌ Error: Groq configuration missing.")
        return jsonify({"status": "error", "message": "Missing Groq configuration"}), 500
        
    prompt = get_extraction_prompt(text, scraped_title, scraped_caption)
    
    chat_completion = None
    for model in MODELS_TO_TRY:
        try:
            chat_completion = groq_client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model=model,
                temperature=0.1
            )
            break
        except Exception as e:
            print(f"Groq model {model} failed: {e}")

    if chat_completion is None:
        send_telegram_message(chat_id, "❌ Failed to parse context with LLM.")
        return jsonify({"status": "error", "message": "All Groq models failed"}), 500

    try:
        raw_output = chat_completion.choices[0].message.content
        raw_output = raw_output.replace("```json", "").replace("```", "").strip()
        extracted_data = json.loads(raw_output)
    except json.JSONDecodeError as e:
        print(f"Groq JSON parsing error: {e}\nRaw output: {raw_output}")
        send_telegram_message(chat_id, "❌ LLM returned invalid JSON. Please try again.")
        return jsonify({"status": "error", "message": "Invalid JSON from LLM"}), 500
        
    # 4. Server-Side Geocoding
    item_type = extracted_data.get("type", "PLACE")
    specific_data = extracted_data.get("specific_data", {})
    
    if item_type == "PLACE" and "location" in specific_data:
        raw_address = specific_data["location"].get("address", "")
        if raw_address:
            lat, lng, fmt_address = geocode_address(raw_address)
            specific_data["location"]["lat"] = lat
            specific_data["location"]["lng"] = lng
            specific_data["location"]["address"] = fmt_address # Standardize address
            
    # 5. Database Insertion
    payload = {
        "type": item_type,
        "title": extracted_data.get("title", "Untitled Item"),
        "thumbnail_url": thumbnail_url,
        "context_tags": extracted_data.get("context_tags", []),
        "original_url": url or "",
        "specific_data": specific_data
    }
    
    try:
        if supabase:
            # We bypass RLS using Server Role Key
            response = supabase.table("culinary_items").insert(payload).execute()
            if response.data:
                payload = response.data[0]
        else:
            print(f"Simulating DB Save: {json.dumps(payload, indent=2)}")
            
        # 6. Success Feedback
        if item_type == "PLACE" and "location" in payload["specific_data"] and payload["specific_data"]["location"]["lat"] != 0:
            send_telegram_message(chat_id, f"✅ Saved: {payload['title']} ({item_type}) 📍 Map Pin Resolved")
        else:
            send_telegram_message(chat_id, f"✅ Saved: {payload['title']} ({item_type})")
            
    except Exception as e:
        print(f"DB Error: {e}")
        send_telegram_message(chat_id, "❌ Failed to save to Supabase Database.")
        return jsonify({"status": "error"}), 500
        
    return jsonify({"status": "success", "data": payload}), 200

@app.route('/api/setup', methods=['GET'])
def setup_webhook():
    """Development helper to quickly set the Telegram webhook."""
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
    # Typically run via gunicorn in production
    port = int(os.environ.get("PORT", 8000))
    app.run(host='0.0.0.0', port=port, debug=True)
