// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractUrl, geocodeAddress, sendTelegramMessage, scrapeMetadata } from '../lib/serverUtils';

// ---------------------------------------------------------------------------
// extractUrl
// ---------------------------------------------------------------------------

describe('extractUrl', () => {
  it('returns URL from text containing one URL', () => {
    expect(extractUrl('Check this out https://example.com great stuff')).toBe('https://example.com');
  });

  it('returns null when no URL in text', () => {
    expect(extractUrl('No links here at all')).toBeNull();
  });

  it('returns first URL when text has multiple URLs', () => {
    expect(extractUrl('First https://first.com then https://second.com')).toBe('https://first.com');
  });

  it('handles http:// scheme', () => {
    expect(extractUrl('Visit http://insecure.com today')).toBe('http://insecure.com');
  });

  it('returns null for empty string', () => {
    expect(extractUrl('')).toBeNull();
  });

  it('handles URL at start of text', () => {
    expect(extractUrl('https://startlink.com is the url')).toBe('https://startlink.com');
  });

  it('handles URL with path and query params', () => {
    expect(extractUrl('go to https://example.com/path?q=1&r=2 now')).toBe('https://example.com/path?q=1&r=2');
  });
});

// ---------------------------------------------------------------------------
// geocodeAddress
// ---------------------------------------------------------------------------

describe('geocodeAddress', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns {lat:0, lng:0, address} when MAPS_API_KEY is not set', async () => {
    vi.stubEnv('MAPS_API_KEY', '');
    const result = await geocodeAddress('1 Infinite Loop, Cupertino');
    expect(result).toEqual({ lat: 0, lng: 0, address: '1 Infinite Loop, Cupertino' });
  });

  it('returns coordinates from Google API on success', async () => {
    vi.stubEnv('MAPS_API_KEY', 'fake-api-key');

    const mockJson = vi.fn().mockResolvedValue({
      status: 'OK',
      results: [
        {
          geometry: { location: { lat: 37.3317, lng: -122.0302 } },
          formatted_address: '1 Infinite Loop, Cupertino, CA 95014, USA',
        },
      ],
    });

    const mockFetch = vi.fn().mockResolvedValue({
      json: mockJson,
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await geocodeAddress('1 Infinite Loop, Cupertino');

    expect(result.lat).toBe(37.3317);
    expect(result.lng).toBe(-122.0302);
    expect(result.address).toBe('1 Infinite Loop, Cupertino, CA 95014, USA');
  });

  it('returns zeros when API returns non-OK status', async () => {
    vi.stubEnv('MAPS_API_KEY', 'fake-api-key');

    const mockFetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ status: 'ZERO_RESULTS', results: [] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await geocodeAddress('Nowhere Land');
    expect(result).toEqual({ lat: 0, lng: 0, address: 'Nowhere Land' });
  });

  it('returns zeros when fetch throws', async () => {
    vi.stubEnv('MAPS_API_KEY', 'fake-api-key');

    const mockFetch = vi.fn().mockRejectedValue(new Error('Network failure'));
    vi.stubGlobal('fetch', mockFetch);

    const result = await geocodeAddress('Some Address');
    expect(result.lat).toBe(0);
    expect(result.lng).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// sendTelegramMessage
// ---------------------------------------------------------------------------

describe('sendTelegramMessage', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('does not call fetch when TELEGRAM_BOT_TOKEN is not set', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await sendTelegramMessage(12345, 'Hello World');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('calls fetch with the correct Telegram API URL when token is set', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'my-test-token');

    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    await sendTelegramMessage(99999, 'Test message');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('api.telegram.org');
    expect(url).toContain('my-test-token');
    expect(url).toContain('sendMessage');
    expect(options.method).toBe('POST');
    const body = JSON.parse(options.body);
    expect(body.chat_id).toBe(99999);
    expect(body.text).toBe('Test message');
  });

  it('does not throw when fetch fails', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'my-test-token');

    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', mockFetch);

    // Should not throw
    await expect(sendTelegramMessage(12345, 'Hello')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// scrapeMetadata
// ---------------------------------------------------------------------------

describe('scrapeMetadata', () => {
  const FALLBACK_THUMBNAIL =
    'https://images.unsplash.com/photo-1498837167922-41c46b3f6162?q=80&w=400&auto=format&fit=crop';

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns thumbnailUrl, title, description from Microlink on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        status: 'success',
        data: {
          title: 'Microlink Page Title',
          description: 'Microlink description text.',
          image: { url: 'https://example.com/ml-image.jpg' },
        },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await scrapeMetadata('https://example.com/article');

    expect(result.title).toBe('Microlink Page Title');
    expect(result.description).toBe('Microlink description text.');
    expect(result.thumbnailUrl).toBe('https://example.com/ml-image.jpg');
  });

  it('returns fallback thumbnail when Microlink image is missing', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        status: 'success',
        data: {
          title: 'No Image Title',
          description: 'Some description',
          image: null,
        },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await scrapeMetadata('https://example.com/noimage');

    expect(result.thumbnailUrl).toBe(FALLBACK_THUMBNAIL);
    expect(result.title).toBe('No Image Title');
  });

  it('falls back to cheerio parsing when Microlink returns non-success status', async () => {
    const htmlPage = `<html><head>
      <meta property="og:title" content="Cheerio OG Title"/>
      <meta property="og:description" content="Cheerio OG description"/>
      <meta property="og:image" content="https://example.com/og.jpg"/>
    </head><body></body></html>`;

    // First call: Microlink failure, Second call: the actual URL for cheerio
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({ status: 'fail' }),
      })
      .mockResolvedValueOnce({
        text: vi.fn().mockResolvedValue(htmlPage),
      });
    vi.stubGlobal('fetch', mockFetch);

    const result = await scrapeMetadata('https://example.com/page');

    expect(result.title).toBe('Cheerio OG Title');
    expect(result.description).toBe('Cheerio OG description');
    expect(result.thumbnailUrl).toBe('https://example.com/og.jpg');
  });

  it('returns fallback values when both Microlink and cheerio fail', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', mockFetch);

    const result = await scrapeMetadata('https://totally-broken.com');

    expect(result.thumbnailUrl).toBe(FALLBACK_THUMBNAIL);
    expect(result.title).toBe('Unknown Title');
    expect(result.description).toBe('');
  });

  it('handles Microlink image as a string (not object)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        status: 'success',
        data: {
          title: 'String Image Test',
          description: '',
          image: 'https://example.com/direct-string-image.jpg',
        },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await scrapeMetadata('https://example.com/str-image');

    expect(result.thumbnailUrl).toBe('https://example.com/direct-string-image.jpg');
  });
});
