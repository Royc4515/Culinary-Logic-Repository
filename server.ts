import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
import * as dotenv from 'dotenv';

dotenv.config();

// Keys & Config
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MAPS_API_KEY = process.env.MAPS_API_KEY; // Optional for geocoding
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

async function sendTelegramMessage(chatId: string | number, text: string) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log(`Would send to Telegram (${chatId}): ${text}`);
    return;
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    });
  } catch (err) {
    console.error("Failed to send telegram message", err);
  }
}

function extractUrl(text: string): string | null {
  const urls = text.match(/(https?:\/\/[^\s]+)/);
  return urls ? urls[0] : null;
}

async function scrapeMetadata(url: string) {
  try {
    // robust method using Microlink
    const microlinkUrl = `https://api.microlink.io?url=${encodeURIComponent(url)}`;
    const mlResponse = await fetch(microlinkUrl, { signal: AbortSignal.timeout(10000) });
    const json = await mlResponse.json();
    
    if (json.status === 'success') {
      const data = json.data || {};
      const title = data.title || "Unknown Title";
      const description = data.description || "";
      let thumbnailUrl = "";
      
      if (typeof data.image === 'object' && data.image !== null) {
        thumbnailUrl = data.image.url || "";
      } else if (typeof data.image === 'string') {
        thumbnailUrl = data.image;
      }
      
      if (!thumbnailUrl) {
        thumbnailUrl = "https://images.unsplash.com/photo-1498837167922-41c46b3f6162?q=80&w=400&auto=format&fit=crop";
      }
      return { thumbnailUrl, title, description };
    }
  } catch (e) {
    console.error(`Microlink API error for ${url}:`, e);
  }

  // fallback to cheerio
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(5000)
    });
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const title = $('meta[property="og:title"]').attr('content') || $('title').text() || "Unknown Title";
    const description = $('meta[property="og:description"]').attr('content') || "";
    const thumbnailUrl = $('meta[property="og:image"]').attr('content') || "https://images.unsplash.com/photo-1498837167922-41c46b3f6162?q=80&w=400&auto=format&fit=crop";
    
    return { thumbnailUrl, title, description };
  } catch (e) {
    console.error(`Scraping error for ${url}:`, e);
    return { 
      thumbnailUrl: "https://images.unsplash.com/photo-1498837167922-41c46b3f6162?q=80&w=400&auto=format&fit=crop", 
      title: "Unknown Title", 
      description: "" 
    };
  }
}

async function geocodeAddress(address: string) {
  if (!MAPS_API_KEY) {
    console.warn("MAPS_API_KEY not set. Skipping geocoding.");
    return { lat: 0, lng: 0, address };
  }
  
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${MAPS_API_KEY}`;
  try {
    const response = await fetch(url);
    const res = await response.json();
    
    if (res.status === 'OK' && res.results.length > 0) {
      const loc = res.results[0].geometry.location;
      const fmtAddress = res.results[0].formatted_address;
      return { lat: loc.lat, lng: loc.lng, address: fmtAddress };
    }
  } catch (e) {
    console.error("Geocoding Error:", e);
  }
  return { lat: 0, lng: 0, address };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Needed to parse JSON bodies for telegram webhooks
  app.use(express.json());

  // API Check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Telegram webhook ingest endpoint
  app.post('/api/webhook', async (req, res) => {
    const update = req.body;
    
    if (!update || !update.message) {
      res.status(200).json({ status: 'ignored' });
      return;
    }
    
    const message = update.message;
    const chatId = message.chat.id;
    const text = message.text || "";
    
    // 1. Notify User
    await sendTelegramMessage(chatId, "🔍 Processing your culinary intel...");
    
    // 2. Extract Data
    const url = extractUrl(text);
    let thumbnailUrl = "https://images.unsplash.com/photo-1498837167922-41c46b3f6162?q=80&w=400&auto=format&fit=crop";
    let scrapedTitle = "";
    let scrapedCaption = "";
    
    if (url) {
      const metadata = await scrapeMetadata(url);
      thumbnailUrl = metadata.thumbnailUrl;
      scrapedTitle = metadata.title;
      scrapedCaption = metadata.description;
    } else if (!text) {
      await sendTelegramMessage(chatId, "⚠️ Please send a URL or text note.");
      res.status(200).json({ status: 'ignored' });
      return;
    }
    
    // 3. LLM Parsing
    const prompt = `You are a culinary data extractor. Analyze the following text and metadata to extract structured data for a Culinary Logic Repository database.
Make sure to generate a relevant 'thumbnail_url' if none is given.

Url: ${url}
Scraped Title: ${scrapedTitle}
Scraped Description: ${scrapedCaption}
User Input: "${text}"`;

    const responseSchema = {
        type: "OBJECT",
        properties: {
          type: { type: "STRING", description: "Must be 'PLACE', 'RECIPE', or 'GEAR'" },
          title: { type: "STRING", description: "Name of the place, recipe or gear." },
          thumbnail_url: { type: "STRING", description: "An image URL (if present in the text) or an empty string" },
          context_tags: { type: "ARRAY", items: { type: "STRING" }, description: "3-5 relevant short tags like 'Italian', 'Date Night', etc." },
          specific_data: {
            type: "OBJECT",
            properties: {
              location: {
                type: "OBJECT",
                properties: {
                  address: { type: "STRING" },
                  lat: { type: "NUMBER" },
                  lng: { type: "NUMBER" }
                }
              },
              prep_time_minutes: { type: "NUMBER" },
              cook_time_minutes: { type: "NUMBER" },
              difficulty: { type: "STRING" },
              ingredients: { type: "ARRAY", items: { type: "STRING" } },
              brand: { type: "STRING" },
              price: { type: "STRING" },
              purchase_link: { type: "STRING" }
            }
          }
        },
        required: ["type", "title", "context_tags", "specific_data"],
    };

    let extractedData;
    try {
      const gResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema as any,
          tools: [{ googleSearch: {} }],
        }
      });
      
      let dataText = gResponse.text || "{}";
      dataText = dataText.replace(/```(?:json)?/g, '').trim();
      extractedData = JSON.parse(dataText);
    } catch (e: any) {
      console.error("Gemini Error:", e);
      await sendTelegramMessage(chatId, "❌ Failed to parse context with LLM.");
      res.status(500).json({ status: "error", message: e.message });
      return;
    }
    
    // 4. Server-Side Geocoding
    const itemType = extractedData.type || "PLACE";
    const specificData = extractedData.specific_data || {};
    
    if (itemType === "PLACE" && specificData.location?.address) {
      const geo = await geocodeAddress(specificData.location.address);
      specificData.location.lat = geo.lat;
      specificData.location.lng = geo.lng;
      specificData.location.address = geo.address;
    }
    
    // 5. Database Insertion
    const payload = {
        type: itemType,
        title: extractedData.title || "Untitled Item",
        thumbnail_url: extractedData.thumbnail_url || thumbnailUrl,
        context_tags: extractedData.context_tags || [],
        original_url: url || "",
        specific_data: specificData
    };
    
    try {
      if (supabase) {
        // use server side key bypass RLS
        const { data, error } = await supabase.from("culinary_items").insert(payload).select().single();
        if (error) throw error;
        Object.assign(payload, data);
      } else {
        console.log("Simulating DB Save:", payload);
      }
      
      if (itemType === "PLACE" && specificData.location?.lat !== 0) {
        await sendTelegramMessage(chatId, `✅ Saved: ${payload.title} (${itemType}) 📍 Map Pin Resolved`);
      } else {
        await sendTelegramMessage(chatId, `✅ Saved: ${payload.title} (${itemType})`);
      }
    } catch (e: any) {
      console.error("DB Error:", e);
      await sendTelegramMessage(chatId, "❌ Failed to save to Supabase Database.");
      res.status(500).json({ status: "error", message: e.message });
      return;
    }
    
    res.status(200).json({ status: 'success', data: payload });
  });

  // Setup Webhook helper
  app.get('/api/setup', async (req, res) => {
    let webhookUrl = req.query.url as string | undefined;
    
    // Automatically use AI Studio APP_URL if not provided via query
    if (!webhookUrl && typeof process.env.APP_URL === 'string') {
        const baseUrl = process.env.APP_URL.endsWith('/') ? process.env.APP_URL.slice(0, -1) : process.env.APP_URL;
        webhookUrl = `${baseUrl}/api/webhook`;
    }

    if (!webhookUrl) {
      res.status(400).json({ error: "Provide ?url=https://your-domain.com/api/webhook or ensure APP_URL is injected." });
      return;
    }
    if (!TELEGRAM_BOT_TOKEN) {
      res.status(500).json({ error: "TELEGRAM_BOT_TOKEN is missing" });
      return;
    }
    
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${webhookUrl}`;
    try {
      const tgRes = await fetch(url);
      const data = await tgRes.json();
      res.status(200).json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In production (if we want to serve static files from dist folder)
    const distPath = process.cwd() + '/dist';
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(distPath + '/index.html');
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
