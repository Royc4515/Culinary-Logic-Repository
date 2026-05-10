"""
Register (or clear) the Telegram webhook for the CLR bot.

Usage:
  # Set the webhook to your production URL:
  python set_webhook.py https://clr-backend.onrender.com/api/webhook

  # Clear the webhook (switches bot back to polling mode):
  python set_webhook.py --delete

Equivalent curl commands:
  # Set:
  curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://clr-backend.onrender.com/api/webhook"

  # Delete:
  curl "https://api.telegram.org/bot<TOKEN>/deleteWebhook"

  # Verify:
  curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
"""

import os
import sys
import requests
from dotenv import load_dotenv

load_dotenv()

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
if not TOKEN:
    print("Error: TELEGRAM_BOT_TOKEN is not set in your environment or .env file.")
    sys.exit(1)

BASE = f"https://api.telegram.org/bot{TOKEN}"

def set_webhook(url: str):
    res = requests.post(f"{BASE}/setWebhook", json={"url": url, "drop_pending_updates": True})
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
