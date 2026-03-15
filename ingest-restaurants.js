#!/usr/bin/env node

/**
 * ingest-restaurants.js
 *
 * Queries Google Places API for restaurant/bar hybrids open past 10pm
 * in LA and NYC neighborhoods, deduplicates against existing venues,
 * and inserts new ones directly into Supabase.
 *
 * Usage:
 *   node ingest-restaurants.js            # run full ingestion
 *   node ingest-restaurants.js --dry-run  # preview without inserting
 */

import fs from 'fs';

// Load .env manually (no dotenv dependency needed)
fs.readFileSync('.env', 'utf-8').split('\n').forEach((line) => {
  const match = line.match(/^([^#=]+)=["']?(.+?)["']?$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
});

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const SUPABASE_URL = 'https://nkjdthjpqomfsqyzfwbj.supabase.co';
const SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ramR0aGpwcW9tZnNxeXpmd2JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5MzgwMTMsImV4cCI6MjA3OTUxNDAxM30.dyLmq066k-el9iBUs4Zi7xpVops6Jwf49p3FqJEyGvk';

const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
};

const DELAY_MS = 200;
const COORD_THRESHOLD = 0.00045; // ~50 meters
const dryRun = process.argv.includes('--dry-run');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Neighborhoods with approximate center coordinates for biased search
const NEIGHBORHOODS = {
  la: [
    { name: 'Santa Monica', lat: 34.0195, lng: -118.4912 },
    { name: 'Venice', lat: 33.9850, lng: -118.4695 },
    { name: 'West Hollywood', lat: 34.0900, lng: -118.3617 },
    { name: 'Silver Lake', lat: 34.0869, lng: -118.2702 },
    { name: 'Los Feliz', lat: 34.1069, lng: -118.2838 },
    { name: 'Downtown Los Angeles', lat: 34.0407, lng: -118.2468 },
    { name: 'Culver City', lat: 34.0211, lng: -118.3965 },
    { name: 'Mar Vista', lat: 34.0028, lng: -118.4298 },
  ],
  nyc: [
    { name: 'Lower East Side', lat: 40.7150, lng: -73.9843 },
    { name: 'East Village', lat: 40.7265, lng: -73.9815 },
    { name: 'West Village', lat: 40.7336, lng: -74.0027 },
    { name: 'SoHo', lat: 40.7233, lng: -73.9985 },
    { name: 'Williamsburg', lat: 40.7081, lng: -73.9571 },
    { name: 'Greenpoint', lat: 40.7282, lng: -73.9542 },
    { name: 'Nolita', lat: 40.7234, lng: -73.9953 },
    { name: 'Chelsea', lat: 40.7465, lng: -74.0014 },
  ],
};

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

function handleApiErrors(data) {
  if (data.status === 'REQUEST_DENIED') throw new Error(`API denied: ${data.error_message}`);
  if (data.status === 'OVER_QUERY_LIMIT') throw new Error('Rate limited — try again later');
}

/**
 * Check if a place is open past 10pm on any day.
 * Uses the periods array from Google Places opening_hours.
 */
function isOpenPast10pm(openingHours) {
  if (!openingHours || !openingHours.periods) return false;

  for (const period of openingHours.periods) {
    // 24-hour places (no close time)
    if (!period.close) return true;

    const closeTime = parseInt(period.close.time, 10);
    // Close time after 2200 (10pm), or wraps past midnight (close time < open time on next day)
    if (closeTime >= 2200 || closeTime === 0) return true;
    // Closes after midnight (next day indicated by close.day !== open.day)
    if (period.close.day !== period.open.day) return true;
  }

  return false;
}

/**
 * Search Google Places for restaurant+bar venues in a neighborhood.
 * Uses Text Search with type filter.
 */
async function searchNeighborhood(neighborhood, cityName) {
  const query = `restaurant bar ${neighborhood.name} ${cityName}`;
  const allResults = [];
  let nextPageToken = null;

  // Fetch up to 3 pages (60 results max)
  for (let page = 0; page < 3; page++) {
    let url;
    if (nextPageToken) {
      url = `https://maps.googleapis.com/maps/api/place/textsearch/json?pagetoken=${nextPageToken}&key=${GOOGLE_API_KEY}`;
      // Google requires a short delay before using page tokens
      await sleep(2000);
    } else {
      url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${neighborhood.lat},${neighborhood.lng}&radius=2000&type=restaurant&key=${GOOGLE_API_KEY}`;
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Google API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    handleApiErrors(data);

    if (data.results) {
      allResults.push(...data.results);
    }

    nextPageToken = data.next_page_token || null;
    if (!nextPageToken) break;
  }

  return allResults;
}

/**
 * Get place details including opening_hours with periods.
 */
async function getPlaceDetails(placeId) {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=opening_hours,types&key=${GOOGLE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status !== 'OK' || !data.result) return null;
  return data.result;
}

/**
 * Check if a place has both restaurant and bar types.
 */
function isRestaurantBarHybrid(types) {
  if (!types) return false;
  const hasRestaurant = types.includes('restaurant');
  const hasBar = types.includes('bar') || types.includes('night_club');
  // Also accept places that serve food and are open late (checked separately)
  return hasRestaurant || (hasBar && types.includes('food'));
}

async function main() {
  if (!GOOGLE_API_KEY) {
    console.error('Missing GOOGLE_PLACES_API_KEY in .env');
    process.exit(1);
  }

  if (dryRun) console.log('=== DRY RUN — no changes will be written ===\n');

  // Fetch all existing venues for dedup
  console.log('Fetching existing venues...');
  const existingRes = await fetch(
    `${SUPABASE_URL}/rest/v1/venues?select=id,name,lat,lng,google_place_id`,
    { headers: HEADERS }
  );

  if (!existingRes.ok) {
    console.error('Failed to fetch venues:', existingRes.status, await existingRes.text());
    process.exit(1);
  }

  const existingVenues = await existingRes.json();
  console.log(`Found ${existingVenues.length} existing venues\n`);

  // Build lookup sets for dedup
  const existingPlaceIds = new Set(
    existingVenues.filter((v) => v.google_place_id).map((v) => v.google_place_id)
  );

  let totalFound = 0;
  let totalSkipped = 0;
  let totalInserted = 0;
  let totalErrors = 0;
  const seenPlaceIds = new Set(); // Dedup within this run
  const sqlStatements = [];
  const OUTPUT_FILE = 'insert_restaurants.sql';

  for (const [cityCode, neighborhoods] of Object.entries(NEIGHBORHOODS)) {
    const cityName = cityCode === 'la' ? 'Los Angeles, CA' : 'New York City, NY';
    const cityValue = cityCode === 'la' ? 'la' : 'nyc';

    console.log(`\n=== ${cityName} ===`);

    for (const neighborhood of neighborhoods) {
      console.log(`\n  Searching: ${neighborhood.name}...`);

      let results;
      try {
        results = await searchNeighborhood(neighborhood, cityName);
      } catch (e) {
        console.error(`  ERROR searching ${neighborhood.name}: ${e.message}`);
        totalErrors++;
        continue;
      }

      console.log(`  Found ${results.length} raw results`);
      totalFound += results.length;

      for (const place of results) {
        const placeId = place.place_id;
        const placeLat = place.geometry?.location?.lat;
        const placeLng = place.geometry?.location?.lng;
        const placeName = place.name;

        if (!placeId || !placeLat || !placeLng || !placeName) {
          totalSkipped++;
          continue;
        }

        // Dedup: skip if we already processed this place_id in this run
        if (seenPlaceIds.has(placeId)) {
          continue;
        }
        seenPlaceIds.add(placeId);

        // Dedup: skip if place_id already exists in DB
        if (existingPlaceIds.has(placeId)) {
          totalSkipped++;
          continue;
        }

        // Dedup: skip if name + coordinates match existing venue within threshold
        const isDuplicate = existingVenues.some((v) => {
          const dLat = Math.abs(v.lat - placeLat);
          const dLng = Math.abs(v.lng - placeLng);
          return dLat < COORD_THRESHOLD && dLng < COORD_THRESHOLD;
        });

        if (isDuplicate) {
          totalSkipped++;
          continue;
        }

        // Check if it's a restaurant/bar hybrid via types from text search
        const textTypes = place.types || [];
        const hasRestaurant = textTypes.includes('restaurant');
        const hasBar = textTypes.includes('bar') || textTypes.includes('night_club');

        if (!hasRestaurant && !hasBar) {
          totalSkipped++;
          continue;
        }

        // Get detailed opening hours to check if open past 10pm
        let openPast10 = false;
        try {
          const details = await getPlaceDetails(placeId);
          if (details?.opening_hours) {
            openPast10 = isOpenPast10pm(details.opening_hours);
          }
          await sleep(DELAY_MS);
        } catch (e) {
          console.error(`    ERROR getting details for ${placeName}: ${e.message}`);
          totalErrors++;
          continue;
        }

        if (!openPast10) {
          totalSkipped++;
          continue;
        }

        // Determine neighborhood from search context
        const venueNeighborhood = neighborhood.name;

        console.log(`    + ${placeName} (${venueNeighborhood}) — open late ✓`);

        // Generate SQL INSERT statement
        const escapedName = placeName.replace(/'/g, "''");
        const escapedNeighborhood = venueNeighborhood.replace(/'/g, "''");
        const escapedPlaceId = placeId.replace(/'/g, "''");
        sqlStatements.push(
          `INSERT INTO public.venues (name, neighborhood, type, lat, lng, city, google_place_id, is_demo, is_user_submitted) ` +
          `VALUES ('${escapedName}', '${escapedNeighborhood}', 'restaurant', ${placeLat}, ${placeLng}, '${cityValue}', '${escapedPlaceId}', false, false) ` +
          `ON CONFLICT (name) DO NOTHING;`
        );
        totalInserted++;

        await sleep(DELAY_MS);
      }
    }
  }

  // Write SQL file
  if (sqlStatements.length > 0 && !dryRun) {
    fs.writeFileSync(OUTPUT_FILE, sqlStatements.join('\n') + '\n');
    console.log(`\nSQL written to ${OUTPUT_FILE}`);
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Done!${dryRun ? ' (dry run)' : ''}`);
  console.log(`  Total found:    ${totalFound}`);
  console.log(`  Skipped (dupe): ${totalSkipped}`);
  console.log(`  SQL generated:  ${sqlStatements.length}`);
  console.log(`  Errors:         ${totalErrors}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
