import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { extractUrl, sendTelegramMessage, scrapeMetadata, geocodeAddress } from './src/lib/serverUtils.js';

dotenv.config();

// Keys & Config
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

export { extractUrl, sendTelegramMessage, scrapeMetadata, geocodeAddress };

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
    
    // 3. Fallback Parsing without LLM
    let extractedData = {
        type: "PLACE",
        title: scrapedTitle || "New Link",
        thumbnail_url: thumbnailUrl,
        context_tags: [],
        specific_data: { location: { address: "", lat: 0, lng: 0 } }
    };
    
    // 4. Server-Side Geocoding
    const itemType = extractedData.type || "PLACE";
    const specificData: any = extractedData.specific_data || {};
    
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
    app.get('/{*path}', (req, res) => {
      res.sendFile(distPath + '/index.html');
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
