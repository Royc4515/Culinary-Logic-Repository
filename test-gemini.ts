import { GoogleGenAI } from "@google/genai";
import * as dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function test() {
    const prompt = `You are an expert culinary data extractor. Analyze the following user input (which may be a URL, a raw note, or a restaurant review) and extract structured data for a Culinary Logic Repository database.

If the input contains a URL, use your search capabilities to look up the content of that URL and extract the recipe, place, or gear details.
If the input is a restaurant or place name, search for its location, website, and details.

Extract accurate and comprehensive details.
Make sure to generate a relevant 'thumbnail_url' (preferably an actual high-quality image URL of the dish/place, or a relevant Unsplash photo url).

You MUST respond with ONLY a valid, raw JSON object representing the extracted data. Do not include markdown formatting or code blocks.

The JSON object MUST follow this schema:
{
  "type": "PLACE" | "RECIPE" | "GEAR",
  "title": "Name of the place, recipe or gear.",
  "thumbnail_url": "Image URL or empty string",
  "original_url": "The source URL if provided",
  "context_tags": ["tag1", "tag2", "tag3"], // 3-5 tags
  "specific_data": {
    // For PLACE
    "location": { "address": "...", "lat": 0, "lng": 0 },
    "website": "...",
    // For RECIPE
    "prep_time_minutes": 0, "cook_time_minutes": 0, "difficulty": "...", "ingredients": ["..."],
    // For GEAR
    "brand": "...", "price": "...", "purchase_link": "..."
  }
}

Input: "https://www.instagram.com/reel/DWdVOMXjN7D/?utm_source=ig_web_copy_link&igsh=NTc4MTIwNjQ2YQ=="`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
            }
        });
        console.log("TEXT:", response.text);
    } catch (e) {
        console.error("ERROR:", e);
    }
}
test().catch(console.error);
