#!/usr/bin/env node

/**
 * fix-venues.js
 *
 * Geocodes all venues in the Supabase database using Mapbox forward geocoding
 * to replace user-GPS coordinates with actual business locations.
 *
 * Usage:
 *   node fix-venues.js            # fix all venues
 *   node fix-venues.js --dry-run  # preview changes without writing
 */

const SUPABASE_URL = 'https://nkjdthjpqomfsqyzfwbj.supabase.co';
const SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ramR0aGpwcW9tZnNxeXpmd2JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5MzgwMTMsImV4cCI6MjA3OTUxNDAxM30.dyLmq066k-el9iBUs4Zi7xpVops6Jwf49p3FqJEyGvk';
const MAPBOX_TOKEN =
  'pk.eyJ1IjoiamFuZXNwb3R0ZWQiLCJhIjoiY21pY2Y1a2ZyMWVseTJycHZ6OHJhbG5kOSJ9.jx5f3tfm6TR5N0iwilj75Q';

const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

const dryRun = process.argv.includes('--dry-run');

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371e3;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function geocodeVenue(name, lat, lng) {
  const encoded = encodeURIComponent(name);
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json` +
    `?proximity=${lng},${lat}&types=poi&limit=3&access_token=${MAPBOX_TOKEN}`;

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  const features = data.features || [];

  let best = null;
  let bestDist = Infinity;

  for (const f of features) {
    const [fLng, fLat] = f.center;
    const dist = haversine(lat, lng, fLat, fLng);
    if (dist < bestDist && dist <= 1000) {
      bestDist = dist;
      best = f;
    }
  }

  if (!best) return null;
  return { lat: best.center[1], lng: best.center[0], dist: bestDist, placeName: best.place_name };
}

async function main() {
  if (dryRun) console.log('=== DRY RUN — no changes will be written ===\n');

  // Fetch all venues
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/venues?select=id,name,lat,lng,city`,
    { headers: HEADERS }
  );

  if (!res.ok) {
    console.error('Failed to fetch venues:', res.status, await res.text());
    process.exit(1);
  }

  const venues = await res.json();
  console.log(`Found ${venues.length} venues to process\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < venues.length; i++) {
    const v = venues[i];
    const progress = `[${i + 1}/${venues.length}]`;

    const result = await geocodeVenue(v.name, v.lat, v.lng);

    if (!result || result.dist < 50) {
      skipped++;
      const reason = result ? `only ${Math.round(result.dist)}m off` : 'no Mapbox match';
      console.log(`${progress} SKIP  "${v.name}" — ${reason}`);
      await sleep(100);
      continue;
    }

    if (dryRun) {
      updated++;
      console.log(
        `${progress} WOULD UPDATE "${v.name}" — move ${Math.round(result.dist)}m → ${result.lat.toFixed(5)}, ${result.lng.toFixed(5)}`
      );
      await sleep(100);
      continue;
    }

    const upRes = await fetch(
      `${SUPABASE_URL}/rest/v1/venues?id=eq.${v.id}`,
      {
        method: 'PATCH',
        headers: HEADERS,
        body: JSON.stringify({ lat: result.lat, lng: result.lng }),
      }
    );

    if (upRes.ok) {
      updated++;
      console.log(
        `${progress} UPDATED "${v.name}" — moved ${Math.round(result.dist)}m → ${result.lat.toFixed(5)}, ${result.lng.toFixed(5)}`
      );
    } else {
      failed++;
      console.error(`${progress} FAILED "${v.name}": ${await upRes.text()}`);
    }

    await sleep(150);
  }

  console.log(`\nDone!${dryRun ? ' (dry run)' : ''}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Failed:  ${failed}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
