const fetch = require('node-fetch');
const cityTimezones = require('city-timezones');

let lastCalled = 0; // In-memory cooldown timestamp

function pad(n) {
  return n < 10 ? '0' + n : n;
}

function formatDate(dateObj) {
  const hours = pad(dateObj.getHours());
  const minutes = pad(dateObj.getMinutes());
  const month = pad(dateObj.getMonth() + 1);
  const day = pad(dateObj.getDate());
  const year = dateObj.getFullYear();
  return `${hours}:${minutes} | ${month}/${day}/${year}`;
}

// US states, for matching
const usStates = [
  { abbr: "AL", name: "Alabama" }, { abbr: "AK", name: "Alaska" }, { abbr: "AZ", name: "Arizona" },
  { abbr: "AR", name: "Arkansas" }, { abbr: "CA", name: "California" }, { abbr: "CO", name: "Colorado" },
  { abbr: "CT", name: "Connecticut" }, { abbr: "DE", name: "Delaware" }, { abbr: "FL", name: "Florida" },
  { abbr: "GA", name: "Georgia" }, { abbr: "HI", name: "Hawaii" }, { abbr: "ID", name: "Idaho" },
  { abbr: "IL", name: "Illinois" }, { abbr: "IN", name: "Indiana" }, { abbr: "IA", name: "Iowa" },
  { abbr: "KS", name: "Kansas" }, { abbr: "KY", name: "Kentucky" }, { abbr: "LA", name: "Louisiana" },
  { abbr: "ME", name: "Maine" }, { abbr: "MD", name: "Maryland" }, { abbr: "MA", name: "Massachusetts" },
  { abbr: "MI", name: "Michigan" }, { abbr: "MN", name: "Minnesota" }, { abbr: "MS", name: "Mississippi" },
  { abbr: "MO", name: "Missouri" }, { abbr: "MT", name: "Montana" }, { abbr: "NE", name: "Nebraska" },
  { abbr: "NV", name: "Nevada" }, { abbr: "NH", name: "New Hampshire" }, { abbr: "NJ", name: "New Jersey" },
  { abbr: "NM", name: "New Mexico" }, { abbr: "NY", name: "New York" }, { abbr: "NC", name: "North Carolina" },
  { abbr: "ND", name: "North Dakota" }, { abbr: "OH", name: "Ohio" }, { abbr: "OK", name: "Oklahoma" },
  { abbr: "OR", name: "Oregon" }, { abbr: "PA", name: "Pennsylvania" }, { abbr: "RI", name: "Rhode Island" },
  { abbr: "SC", name: "South Carolina" }, { abbr: "SD", name: "South Dakota" }, { abbr: "TN", name: "Tennessee" },
  { abbr: "TX", name: "Texas" }, { abbr: "UT", name: "Utah" }, { abbr: "VT", name: "Vermont" },
  { abbr: "VA", name: "Virginia" }, { abbr: "WA", name: "Washington" }, { abbr: "WV", name: "West Virginia" },
  { abbr: "WI", name: "Wisconsin" }, { abbr: "WY", name: "Wyoming" }
];

// Parse a query like "Springfield MO" or "Springfield Missouri"
function parseCityState(query) {
  const parts = query.trim().split(/[\s,]+/);
  if (parts.length < 2) return { city: query.trim(), state: null };

  let possibleState = parts[parts.length - 1];
  let stateObj = usStates.find(
    s =>
      s.abbr.toLowerCase() === possibleState.toLowerCase() ||
      s.name.toLowerCase() === possibleState.toLowerCase()
  );
  if (stateObj) {
    return {
      city: parts.slice(0, parts.length - 1).join(" "),
      state: stateObj
    };
  }
  return { city: query.trim(), state: null };
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const now = Date.now();
  const COOLDOWN = 60 * 1000;
  if (now - lastCalled < COOLDOWN) {
    const secondsLeft = Math.ceil((COOLDOWN - (now - lastCalled)) / 1000);
    res.setHeader('Content-Type', 'text/plain');
    res.status(429).send(`Cooldown in effect, try again in ${secondsLeft} seconds.`);
    return;
  }

  const query = (req.query.query || req.query.q || '').trim();
  if (!query) {
    res.setHeader('Content-Type', 'text/plain');
    res.status(400).send('Please provide a location, e.g., !localtime London');
    return;
  }

  const { city, state } = parseCityState(query);
  let matches = cityTimezones.lookupViaCity(city);
  let found = null;

  if (matches.length > 0) {
    let usMatches = matches.filter(m => m.country === 'United States');
    let candidates = usMatches.length > 0 ? usMatches : matches;

    // If state is given, match region ONLY to full state name (case-insensitive)
    if (state && candidates.length > 0) {
      let stateMatches = candidates.filter(
        m => m.region && m.region.toLowerCase() === state.name.toLowerCase()
      );
      if (stateMatches.length > 0) {
        found = stateMatches[0];
      }
    }

    // If no state, and city is Springfield, prefer Missouri
    if (!found && city.trim().toLowerCase() === "springfield") {
      let springfieldMO = candidates.find(
        m => m.region && m.region.toLowerCase() === "missouri"
      );
      if (springfieldMO) found = springfieldMO;
    }

    // Otherwise, pick the first matching US city
    if (!found && candidates.length > 0) {
      found = candidates[0];
    }
  }

  if (!found || !found.city || !found.country) {
    res.setHeader('Content-Type', 'text/plain');
    res.status(404).send('Could not find a timezone for that city. Try a major city or check your spelling.');
    return;
  }

  // TimeZoneDB requires country code (US), region (state), and city
  const apiKey = process.env.TIMEZONEDB_API_KEY;
  if (!apiKey) {
    res.setHeader('Content-Type', 'text/plain');
    res.status(500).send('TimeZoneDB API key is not set.');
    return;
  }

  // Use get-time-zone by city, region, country code
  const countryCode = found.country_code || "US"; // city-timezones sometimes omits country_code, default to US
  const region = found.region || ""; // state full name
  const tzdbUrl = `https://api.timezonedb.com/v2.1/get-time-zone?key=${apiKey}&format=json&by=city&country=${encodeURIComponent(countryCode)}&city=${encodeURIComponent(found.city)}${region ? `&region=${encodeURIComponent(region)}` : ''}`;

  let tzdbData;
  try {
    const resp = await fetch(tzdbUrl);
    tzdbData = await resp.json();
    if (tzdbData.status !== "OK") throw new Error(tzdbData.message || "Timezone lookup failed");
  } catch (e) {
    res.setHeader('Content-Type', 'text/plain');
    res.status(404).send('Could not retrieve time for that location. Please try again in 1 minute.');
    return;
  }

  lastCalled = Date.now();

  // Format time for output
  let locationLabel = found.city;
  if (found.country === 'United States' && found.region) {
    locationLabel += `, ${found.region}, United States of America`;
  } else {
    locationLabel += `, ${found.country}`;
  }
  const localDate = new Date(tzdbData.formatted.replace(' ', 'T'));
  const gmtOffset = tzdbData.gmtOffset / 3600;
  const offsetShort = (gmtOffset >= 0 ? "+" : "") + gmtOffset.toString().padStart(2, "0");
  const utcString = `UTC Conversion ${offsetShort}`;
  const response = `Current time in ${locationLabel}: ${formatDate(localDate)} (${utcString})`;

  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send(response);
};
