// supabase/functions/weather/index.ts
//
// Deno Edge Function proxying OpenWeather for Gale's window particles.
// Keeps the API key server-side (never in VITE_*). 10-minute in-memory
// cache per city to stay well under the 60 calls/min free-tier budget.
//
// Deploy:
//   supabase functions deploy weather
// Secret (set once):
//   supabase secrets set OPENWEATHER_API_KEY=...
// Call:
//   GET /functions/v1/weather?city=NYC
//   Authorization: Bearer <anon key>
//
// Response:
//   { city, label, condition, temp_f, observed_at }

type Condition = 'rain' | 'snow' | 'storm' | 'clouds' | 'clear' | 'mist';

interface WeatherResponse {
  city: string;
  label: string;
  condition: Condition;
  temp_f: number;
  observed_at: string;
}

// Gale's five cities — must match AGENT_META.gale.cities_or_tags.
const CITY_COORDS: Record<string, { lat: number; lon: number; label: string }> = {
  MIA: { lat: 25.7617, lon: -80.1918, label: 'Miami' },
  LAX: { lat: 33.9416, lon: -118.4085, label: 'Los Angeles' },
  NYC: { lat: 40.7128, lon: -74.006, label: 'New York' },
  CHI: { lat: 41.8781, lon: -87.6298, label: 'Chicago' },
  DEN: { lat: 39.7392, lon: -104.9903, label: 'Denver' },
};

function mapCondition(main: string): Condition {
  switch (main.toLowerCase()) {
    case 'rain':
    case 'drizzle':
      return 'rain';
    case 'snow':
      return 'snow';
    case 'thunderstorm':
      return 'storm';
    case 'clouds':
      return 'clouds';
    case 'clear':
      return 'clear';
    case 'mist':
    case 'fog':
    case 'haze':
    case 'smoke':
      return 'mist';
    default:
      return 'clouds';
  }
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { data: WeatherResponse; expires: number }>();

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== 'GET') {
    return new Response('method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const cityRaw = url.searchParams.get('city') ?? 'NYC';
  const city = cityRaw.toUpperCase();
  const coords = CITY_COORDS[city];
  if (!coords) {
    return new Response(
      JSON.stringify({ error: `unknown city: ${cityRaw}` }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  const cached = cache.get(city);
  if (cached && cached.expires > Date.now()) {
    return new Response(JSON.stringify(cached.data), {
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
        'X-Cache': 'HIT',
        'Cache-Control': 'public, max-age=60',
      },
    });
  }

  const apiKey = Deno.env.get('OPENWEATHER_API_KEY');
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'OPENWEATHER_API_KEY not configured' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  const owUrl =
    `https://api.openweathermap.org/data/2.5/weather?lat=${coords.lat}&lon=${coords.lon}` +
    `&appid=${apiKey}&units=imperial`;

  try {
    const res = await fetch(owUrl);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`openweather ${res.status}: ${body.slice(0, 120)}`);
    }
    const raw = await res.json();
    const data: WeatherResponse = {
      city,
      label: coords.label,
      condition: mapCondition(raw.weather?.[0]?.main ?? 'clear'),
      temp_f: Math.round(raw.main?.temp ?? 0),
      observed_at: new Date((raw.dt ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    };
    cache.set(city, { data, expires: Date.now() + CACHE_TTL_MS });

    return new Response(JSON.stringify(data), {
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
        'X-Cache': 'MISS',
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }
});
