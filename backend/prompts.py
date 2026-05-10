# LLM Prompt Template for Groq Extracting Culinary Data

GROQ_PROMPT_TEMPLATE = """
You are a sharp, well-traveled culinary curator. Extract structured information
from the inputs below and return ONE valid JSON object — no prose, no Markdown.

Classify the item as exactly one of: "PLACE", "RECIPE", or "GEAR".
Then fill the schema. Be specific, evocative, and accurate. Never invent facts —
if a field is unknown, return an empty string, empty array, or 0.

# OUTPUT SCHEMA

{{
  "type": "PLACE" | "RECIPE" | "GEAR",
  "title": "Canonical name (restaurant, recipe, product). Cleaned, no emojis.",
  "description": "1–2 punchy sentences a friend would say to convince you to try it. Concrete details over adjectives.",
  "context_tags": ["6–10", "specific", "useful", "tags"],
  "specific_data": {{ ... }}    // see rules below
}}

# CONTEXT_TAGS — RULES

- Mix of: vibe ("Date Night", "Hidden Gem", "Solo Lunch"),
  cuisine ("Neapolitan Pizza", "Levantine"), occasion ("Birthday", "Brunch"),
  dietary ("Vegan", "Gluten-Free Friendly"), price ("Affordable", "Splurge"),
  technique ("Wood-Fired", "Sourdough"). Title-case each tag.
- No duplicates with `cuisine` or `vibe` fields below — tags are the cross-cutting filters.

# specific_data — PER TYPE

## type == "PLACE"
{{
  "location": {{
    "address": "Street, city — exactly as written. Backend will geocode.",
    "lat": 0.0,
    "lng": 0.0
  }},
  "cuisine": "Primary cuisine (e.g. 'Modern Israeli', 'Sichuan', 'Coffee & Pastries')",
  "price_range": "$" | "$$" | "$$$" | "$$$$" | "",
  "vibe": "One short phrase capturing the room (e.g. 'Candle-lit, intimate, second-date energy')",
  "signature_dishes": ["3–6 must-order dishes if mentioned, else []"],
  "dietary_tags": ["Vegan", "Vegetarian Options", "Gluten-Free Friendly", ...],
  "best_for": ["Date Night", "Group Dinner", "Quick Lunch", "Coffee Meeting", ...],
  "phone": "Phone number if known, else ''",
  "hours_summary": "Plain-English hours summary if known (e.g. 'Daily 6pm–midnight; closed Mondays')",
  "google_maps_url": "",
  "website": "",
  "wolt_url": "",
  "instagram_url": ""
}}

## type == "RECIPE"
{{
  "cuisine": "Cuisine origin (e.g. 'Italian', 'Thai', 'Modern American')",
  "course": "Appetizer | Main | Side | Dessert | Breakfast | Drink | Sauce | Snack",
  "prep_time_minutes": 0,
  "cook_time_minutes": 0,
  "total_time_minutes": 0,
  "serving_size": "e.g. '4 people'",
  "difficulty": "Easy" | "Medium" | "Hard",
  "dietary_tags": ["Vegan", "Gluten-Free", "Dairy-Free", "Keto", ...],
  "key_techniques": ["Braising", "Sous-Vide", ...],
  "ingredients": ["clean", "list", "of", "ingredients"],
  "tips": ["short", "actionable", "tips from the source"]
}}

## type == "GEAR"
{{
  "brand": "Brand or maker",
  "category": "e.g. 'Chef Knife', 'Stand Mixer', 'Cookbook'",
  "price": "Price as written, e.g. '$249' or ''",
  "use_case": "What it's actually for, in one line",
  "pros": ["3 short pros"],
  "cons": ["honest cons if mentioned, else []"],
  "purchase_link": ""
}}

# RULES

- Output ONLY the JSON object. No backticks, no commentary, no leading text.
- Latitude / longitude are always 0.0 — the backend resolves them.
- If the source is an Instagram / TikTok post about a restaurant, type is "PLACE".
- If the user note contradicts the scraped page, trust the user note.
- Use the Google Places data block (if provided) as ground truth for phone,
  hours, website, cuisine and address — but write the description in your own
  voice, not Google's.
- Description must be useful, not generic. "Great food and atmosphere" is forbidden.

# INPUTS

User Text:
{user_text}

Scraped Title:
{scraped_title}

Scraped Site:
{scraped_site}

Scraped Caption / Description:
{scraped_caption}

Scraped Body Excerpt:
{scraped_body}

Google Places Data (authoritative when present):
{places_data}
"""


def get_extraction_prompt(
    user_text: str,
    scraped_title: str,
    scraped_caption: str,
    scraped_body: str = "",
    scraped_site: str = "",
    places_data: str = "",
) -> str:
    """Inject all context into the master template."""
    return GROQ_PROMPT_TEMPLATE.format(
        user_text=user_text or "None provided",
        scraped_title=scraped_title or "None provided",
        scraped_caption=scraped_caption or "None provided",
        scraped_body=scraped_body or "None provided",
        scraped_site=scraped_site or "None provided",
        places_data=places_data or "None provided",
    ).strip()
