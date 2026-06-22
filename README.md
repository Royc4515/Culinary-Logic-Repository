# Culinary Logic Repository (CLR)

Culinary Logic Repository (CLR) is a smart, centralized hub for curating, organizing, and exploring your favorite culinary discoveries. Whether it's a buzzing new restaurant, an unforgettable recipe, or highly recommended kitchen gear, CLR helps you capture and structure this information effortlessly.

## 🌟 Features

- **AI Ingestion via Telegram**: Send a URL (Instagram, TikTok, article, Google Maps link) or a rough text note to the companion Telegram bot. CLR scrapes the page, enriches places via Google Places, and uses an LLM (Groq) to extract structured metadata (title, location, vibe, ingredients, pros/cons) before saving it to your repository. *The Telegram bot is the AI entry point — the web app itself uses a structured manual-add form (below).*
- **Manual Add in the Web App**: Prefer to enter things yourself? Add and edit items directly through a structured form in the web app.
- **Categorization**: Items are neatly categorized into:
  - 🍽️ **Places**: Restaurants, cafes, and bars with detailed info like cuisines, vibes, best for, and opening hours.
  - 📖 **Recipes**: Total time, difficulty, ingredients, and key techniques.
  - 🔪 **Gear**: Brand, category, price, pros, and cons.
- **Beautiful & Responsive UI**: Built with React and Tailwind CSS, featuring masonry grid layouts, filter tags, and rich item detail modals.
- **Image Fallbacks**: When OpenGraph scraping yields no image, CLR falls back to Google Places photos and a set of curated, on-theme images so cards always look good.

## 📸 Screenshots

### Main Dashboard Grid
![Main Grid](./screenshots/main-grid.png)
*A masonry grid view of all curated places, recipes, and gear, filterable by contextual tags.*

### Map View
![Map View](./screenshots/map-view.png)
*Interactive map view to explore places spatially.*

### Item Details Modal
![Item Details](./screenshots/item-details.png)
*Detailed view showing rich context, tags, photo gallery, and specific attributes.*

### Telegram Bot Integration
![Telegram Bot Connect](./screenshots/telegram-bot-connect.png)
*Connect your account to the companion Telegram bot.*

![Telegram Conversation](./screenshots/telegram-convo.png)
*Seamlessly ingest links and discoveries on the go via Telegram.*

### Log In
![Log In](./screenshots/log-in.png)
*User authentication experience.*

## 🏗️ Architecture

CLR is split into two independently-deployed pieces:

- A **Vite/React single-page app** (hosted statically; `server.ts` is only a thin dev/host wrapper and contains no API logic).
- A separate **Python/Flask backend** (`backend/`, deployed on Render) that owns *all* server logic: the Telegram webhook, scraping, Google Places enrichment, the Groq LLM extraction, and Supabase writes.

The frontend talks to the backend over HTTP (`VITE_BACKEND_URL`) and reads/writes Supabase directly (guarded by Row-Level Security).

## 🚀 Tech Stack

- **Frontend**: React, Vite, Tailwind CSS, pre-built components (Lucide React & Framer Motion).
- **Backend (Python)**: Flask/Gunicorn ingestion engine using BeautifulSoup for scraping and the Groq LLM API for text extraction. 
- **Database**: Supabase (PostgreSQL) for remote data storage.
- **APIs**: 
  - Google Places API (Geocoding & Photos)
  - Groq API (LLM Extraction)
  - Telegram Bot API
  - Unsplash Source (Fallback Photography)

## 🛠️ Setup & Installation

1. Copy `.env.example` to `.env` and fill out your secrets (Supabase, Groq API, Google Maps Platform).
2. Install frontend dependencies:
   ```bash
   npm install
   ```
3. Run the frontend development server:
   ```bash
   npm run dev
   ```
4. Run the Python backend:
   ```bash
   cd backend
   pip install -r requirements.txt
   python app.py
   ```

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
