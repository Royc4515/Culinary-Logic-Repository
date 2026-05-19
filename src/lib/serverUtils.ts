import * as cheerio from 'cheerio';

const FALLBACK_THUMBNAIL =
  'https://images.unsplash.com/photo-1498837167922-41c46b3f6162?q=80&w=400&auto=format&fit=crop';

export function extractUrl(text: string): string | null {
  const urls = text.match(/(https?:\/\/[^\s]+)/);
  return urls ? urls[0] : null;
}

export async function sendTelegramMessage(chatId: string | number, text: string): Promise<void> {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!TELEGRAM_BOT_TOKEN) {
    console.log(`Would send to Telegram (${chatId}): ${text}`);
    return;
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (err) {
    console.error('Failed to send telegram message', err);
  }
}

export async function scrapeMetadata(url: string): Promise<{
  thumbnailUrl: string;
  title: string;
  description: string;
}> {
  try {
    const microlinkUrl = `https://api.microlink.io?url=${encodeURIComponent(url)}`;
    const mlResponse = await fetch(microlinkUrl, { signal: AbortSignal.timeout(10000) });
    const json = await mlResponse.json();

    if (json.status === 'success') {
      const data = json.data || {};
      const title = data.title || 'Unknown Title';
      const description = data.description || '';
      let thumbnailUrl = '';

      if (typeof data.image === 'object' && data.image !== null) {
        thumbnailUrl = data.image.url || '';
      } else if (typeof data.image === 'string') {
        thumbnailUrl = data.image;
      }

      if (!thumbnailUrl) {
        thumbnailUrl = FALLBACK_THUMBNAIL;
      }
      return { thumbnailUrl, title, description };
    }
  } catch (e) {
    console.error(`Microlink API error for ${url}:`, e);
  }

  // fallback to cheerio
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(5000),
    });
    const html = await response.text();
    const $ = cheerio.load(html);

    const title =
      $('meta[property="og:title"]').attr('content') || $('title').text() || 'Unknown Title';
    const description = $('meta[property="og:description"]').attr('content') || '';
    const thumbnailUrl =
      $('meta[property="og:image"]').attr('content') || FALLBACK_THUMBNAIL;

    return { thumbnailUrl, title, description };
  } catch (e) {
    console.error(`Scraping error for ${url}:`, e);
    return {
      thumbnailUrl: FALLBACK_THUMBNAIL,
      title: 'Unknown Title',
      description: '',
    };
  }
}

export async function geocodeAddress(address: string): Promise<{
  lat: number;
  lng: number;
  address: string;
}> {
  const MAPS_API_KEY = process.env.MAPS_API_KEY;
  if (!MAPS_API_KEY) {
    console.warn('MAPS_API_KEY not set. Skipping geocoding.');
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
    console.error('Geocoding Error:', e);
  }
  return { lat: 0, lng: 0, address };
}
