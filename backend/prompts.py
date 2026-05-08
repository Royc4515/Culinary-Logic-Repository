# LLM Prompt Template for Groq Extracting Culinary Data

GROQ_PROMPT_TEMPLATE = """
You are a highly capable culinary data extraction agent.
Your task is to extract structured information from a user's text message and/or a scraped website caption.
The user might provide a link to a place, recipe, or cooking gear, alongside their own note.

You must autonomously classify the item into one of three types: "PLACE", "RECIPE", or "GEAR".
Then, extract the relevant properties and return a strict JSON object.

# SCHEMA REQUIREMENTS

The output must be a valid JSON object matching exactly this structure:
{
    "type": "PLACE" | "RECIPE" | "GEAR",
    "title": "Name of the entity (e.g., restaurant name, recipe name, product name)",
    "context_tags": ["Array", "of", "relevant", "tags", "e.g.", "Date Night", "Keto", "High End"],
    "specific_data": {
        // DEPENDS ON THE TYPE. See rules below.
    }
}

# specific_data RULES

1. If type is "PLACE":
   - "specific_data" MUST include:
     {
        "location": {
            "address": "Extracted address or location name. Map API will resolve the rest.",
            "lat": 0.0,
            "lng": 0.0
        },
        "google_maps_url": "Extract if present, else empty string",
        "website": "Extract website url if present, else empty string",
        "wolt_url": "Extract wolt url if present, else empty string",
        "instagram_url": "Extract instagram url if present, else empty string"
     }

2. If type is "RECIPE":
   - "specific_data" MUST include:
     {
        "prep_time_minutes": integer (estimate based on recipe if not explicit, use 0 if unknown),
        "cook_time_minutes": integer (estimate based on recipe if not explicit, use 0 if unknown),
        "serving_size": "Extracted serving size (e.g., '4 people', '2 portions') or empty string if unknown",
        "difficulty": "Easy" | "Medium" | "Hard",
        "ingredients": ["list", "of", "extracted", "ingredients"]
     }

3. If type is "GEAR":
   - "specific_data" MUST include:
     {
        "brand": "Extract or guess brand from text",
        "price": "Extracted price (e.g., '$40') or empty string",
        "purchase_link": "Extract URL if distinct from original_url, else empty string"
     }

# CONSTANTS AND RULES
- The 'type' MUST be exactly one of "PLACE", "RECIPE", or "GEAR".
- "lat" and "lng" should be 0.0, the backend geocoding service will populate these.
- Only return the JSON object, absolutely no Markdown formatting, no explanation, no backticks.
- Be robust: If you are scraping a TikTok/Instagram link about a restaurant, set "type" to "PLACE".

# INPUTS
User Text: {user_text}
Scraped Title: {scraped_title}
Scraped Caption (og:description): {scraped_caption}
"""

def get_extraction_prompt(user_text: str, scraped_title: str, scraped_caption: str) -> str:
    """Injects the dynamic inputs into the prompt master template."""
    return GROQ_PROMPT_TEMPLATE.format(
        user_text=user_text or "None provided",
        scraped_title=scraped_title or "None provided",
        scraped_caption=scraped_caption or "None provided"
    ).strip()
