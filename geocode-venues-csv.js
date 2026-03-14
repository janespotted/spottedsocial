import fs from 'fs';
// Load .env manually (no dotenv dependency needed)
fs.readFileSync('.env', 'utf-8').split('\n').forEach((line) => {
  const match = line.match(/^([^#=]+)=["']?(.+?)["']?$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
});

function parseCSV(text) {
  const lines = text.split('\n').filter((l) => l.trim());
  const delim = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(delim).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = line.split(delim).map((v) => v.trim().replace(/^"|"$/g, ''));
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] || '']));
  });
}

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const THRESHOLD = 0.002; // ~200 meters
const DELAY_MS = 200;
const INPUT_FILE = 'venues.csv';
const OUTPUT_FILE = 'fix_venues.sql';

const CITY_MAP = {
  la:  'Los Angeles, CA',
  nyc: 'New York City, NY',
  pb:  'West Palm Beach, FL',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function handleApiErrors(data) {
  if (data.status === 'REQUEST_DENIED') throw new Error(`API denied: ${data.error_message}`);
  if (data.status === 'OVER_QUERY_LIMIT') throw new Error('Rate limited — try again later');
}

async function getPlaceDetails(placeId) {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry,name,formatted_address&key=${GOOGLE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  handleApiErrors(data);
  if (data.status !== 'OK' || !data.result) return null;
  const place = data.result;
  return {
    lat: place.geometry.location.lat,
    lng: place.geometry.location.lng,
    name: place.name,
    address: place.formatted_address,
    source: 'place_id',
  };
}

async function searchPlace(query) {
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${GOOGLE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  handleApiErrors(data);
  if (data.status !== 'OK' || !data.results || data.results.length === 0) return null;
  const place = data.results[0];
  return {
    lat: place.geometry.location.lat,
    lng: place.geometry.location.lng,
    name: place.name,
    address: place.formatted_address,
    source: 'text_search',
  };
}

async function main() {
  if (!GOOGLE_API_KEY) {
    console.error('Missing GOOGLE_PLACES_API_KEY in .env');
    process.exit(1);
  }

  const csv = fs.readFileSync(INPUT_FILE, 'utf-8');
  const venues = parseCSV(csv);
  const withPlaceId = venues.filter((v) => v.google_place_id).length;
  console.log(`Loaded ${venues.length} venues (${withPlaceId} with place_id, ${venues.length - withPlaceId} text search fallback)`);

  const updates = [];
  let skipped = 0;
  let noResult = 0;
  let unchanged = 0;
  let detailsUsed = 0;
  let searchUsed = 0;

  for (let i = 0; i < venues.length; i++) {
    const v = venues[i];
    const oldLat = parseFloat(v.lat);
    const oldLng = parseFloat(v.lng);

    let result;
    try {
      if (v.google_place_id) {
        result = await getPlaceDetails(v.google_place_id);
        if (result) detailsUsed++;
      }
      if (!result) {
        const cityName = CITY_MAP[(v.city || '').toLowerCase()] || v.city || '';
        const query = [v.name, cityName].filter(Boolean).join(', ');
        result = await searchPlace(query);
        if (result) searchUsed++;
      }
    } catch (e) {
      console.error(`  [${i + 1}/${venues.length}] ERROR ${v.name}: ${e.message}`);
      skipped++;
      await sleep(DELAY_MS);
      continue;
    }

    if (!result) {
      console.log(`  [${i + 1}/${venues.length}] NO RESULT: ${v.name}`);
      noResult++;
      await sleep(DELAY_MS);
      continue;
    }

    const dLat = Math.abs(result.lat - oldLat);
    const dLng = Math.abs(result.lng - oldLng);

    if (dLat > THRESHOLD || dLng > THRESHOLD) {
      console.log(`  [${i + 1}/${venues.length}] FLAGGED [${result.source}]: ${v.name} | old(${oldLat}, ${oldLng}) → new(${result.lat}, ${result.lng}) | ${result.name} — ${result.address}`);
      const escapedName = v.name.replace(/'/g, "''");
      updates.push(
        `UPDATE venues SET lat = ${result.lat}, lng = ${result.lng} WHERE id = '${v.id}'; -- ${escapedName} [${result.source}] (was ${oldLat}, ${oldLng})`
      );
    } else {
      console.log(`  [${i + 1}/${venues.length}] OK [${result.source}]: ${v.name} (delta ${dLat.toFixed(5)}, ${dLng.toFixed(5)})`);
      unchanged++;
    }

    await sleep(DELAY_MS);
  }

  if (updates.length > 0) {
    fs.writeFileSync(OUTPUT_FILE, updates.join('\n') + '\n');
  }

  console.log(`\nDone.`);
  console.log(`  Total:       ${venues.length}`);
  console.log(`  Flagged:     ${updates.length} → written to ${OUTPUT_FILE}`);
  console.log(`  Unchanged:   ${unchanged}`);
  console.log(`  No result:   ${noResult}`);
  console.log(`  Errors:      ${skipped}`);
  console.log(`  Via place_id:    ${detailsUsed}`);
  console.log(`  Via text search: ${searchUsed}`);
}

main();
