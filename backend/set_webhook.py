"""
Register (or clear) the Telegram webhook for the CLR bot.

Usage:
  # Set the webhook to your production URL (registers TELEGRAM_WEBHOOK_SECRET too):
  python set_webhook.py https://your-backend.example.com/api/webhook

  # Clear the webhook (switches bot back to polling mode):
  python set_webhook.py --delete

Equivalent curl commands:
  # Set:
  curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-backend.example.com/api/webhook&secret_token=<SECRET>"

  # Delete:
  curl "https://api.telegram.org/bot<TOKEN>/deleteWebhook"

  # Verify:
  curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
"""

import os
import re
import sys
import requests
from dotenv import load_dotenv

load_dotenv()

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
if not TOKEN:
    print("Error: TELEGRAM_BOT_TOKEN is not set in your environment or .env file.")
    sys.exit(1)

BASE = f"https://api.telegram.org/bot{TOKEN}"

# Must match the backend's env var: Telegram sends it back on every update and
# app.py rejects updates without it.
WEBHOOK_SECRET = (os.getenv("TELEGRAM_WEBHOOK_SECRET") or "").strip()
# Telegram's own constraint on secret_token; checked here so a bad value fails
# loudly instead of as an opaque setWebhook error.
SECRET_TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,256}$")

def set_webhook(url: str):
    payload = {"url": url, "drop_pending_updates": True}
    if WEBHOOK_SECRET:
        if not SECRET_TOKEN_PATTERN.match(WEBHOOK_SECRET):
            print("Error: TELEGRAM_WEBHOOK_SECRET must be 1-256 chars of A-Z, a-z, 0-9, _ or -.")
            sys.exit(1)
        payload["secret_token"] = WEBHOOK_SECRET
    else:
        print("⚠️  TELEGRAM_WEBHOOK_SECRET is not set; registering without a secret (local dev only).")
    res = requests.post(f"{BASE}/setWebhook", json=payload)
    data = res.json()
    if data.get("ok"):
        print(f"✅ Webhook set to: {url}")
    else:
        print(f"❌ Failed: {data}")

def delete_webhook():
    res = requests.post(f"{BASE}/deleteWebhook", json={"drop_pending_updates": True})
    data = res.json()
    if data.get("ok"):
        print("✅ Webhook deleted — bot is now in polling mode.")
    else:
        print(f"❌ Failed: {data}")

def get_info():
    res = requests.get(f"{BASE}/getWebhookInfo")
    import json
    print(json.dumps(res.json(), indent=2))

if len(sys.argv) < 2:
    print(__doc__)
    sys.exit(0)

arg = sys.argv[1]
if arg == "--delete":
    delete_webhook()
elif arg == "--info":
    get_info()
elif arg.startswith("http"):
    set_webhook(arg)
else:
    print(f"Unknown argument: {arg}")
    print("Usage: python set_webhook.py <https://your-url/api/webhook> | --delete | --info")
    sys.exit(1)
