#!/usr/bin/env bash
# CLR local development startup script
# Usage: bash run_local.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   CLR Backend — Local Dev Startup         ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. .env check ────────────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
    if [ -f "../.env.example" ]; then
        echo "⚠️  No .env found. Copying .env.example → .env"
        cp "../.env.example" ".env"
        echo "   Fill in the values in backend/../.env before continuing."
    else
        echo "❌  No .env file found. Copy .env.example to .env and fill in your secrets."
        exit 1
    fi
fi

# ── 2. Python check ───────────────────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
    echo "❌  python3 not found. Install Python 3.10+."
    exit 1
fi
PYTHON=$(command -v python3)
echo "🐍 Using Python: $PYTHON ($($PYTHON --version))"

# ── 3. Virtual environment ────────────────────────────────────────────────────
VENV_DIR="$SCRIPT_DIR/.venv"
if [ ! -d "$VENV_DIR" ]; then
    echo "📦 Creating virtual environment at .venv..."
    $PYTHON -m venv "$VENV_DIR"
fi
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

# ── 4. Install dependencies ───────────────────────────────────────────────────
echo "📥 Installing dependencies from requirements.txt..."
pip install -q --upgrade pip
pip install -q -r requirements.txt
echo "✅ Dependencies installed."

# ── 5. Validate environment keys ─────────────────────────────────────────────
echo ""
echo "🔑 Checking environment variables:"
MISSING=0
for VAR in TELEGRAM_BOT_TOKEN GROQ_API_KEY MAPS_API_KEY SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY; do
    VALUE=$(grep -E "^${VAR}=" .env 2>/dev/null | cut -d '=' -f2- | tr -d '"')
    if [ -z "$VALUE" ] || [[ "$VALUE" == your_* ]]; then
        echo "   ❌  $VAR — NOT SET (edit .env)"
        MISSING=$((MISSING + 1))
    else
        echo "   ✅  $VAR"
    fi
done

if [ "$MISSING" -gt 0 ]; then
    echo ""
    echo "⚠️  $MISSING variable(s) missing. The server will start but affected stages will be skipped."
    echo "   Edit .env and restart when ready."
fi

# ── 6. Start Flask ────────────────────────────────────────────────────────────
echo ""
echo "🚀 Starting Flask on http://0.0.0.0:8000"
echo "   Health check:    http://localhost:8000/"
echo "   Webhook:         http://localhost:8000/api/webhook"
echo "   Webhook info:    http://localhost:8000/api/webhook/info"
echo "   Setup endpoint:  http://localhost:8000/api/setup?url=<ngrok-url>/api/webhook"
echo ""
echo "   In a separate terminal, run:"
echo "     ngrok http 8000"
echo "   Then register the webhook:"
echo "     http://localhost:8000/api/setup?url=https://<ngrok-id>.ngrok-free.app/api/webhook"
echo ""
echo "   To run the local pipeline test (no Telegram needed):"
echo "     python test_pipeline.py"
echo ""
echo "─────────────────────────────────────────────────────────────"

python app.py
