// Use CommonJS syntax for maximum compatibility on Vercel.
// If your package.json does NOT include "type": "module", use require() and module.exports

const fetch = require('node-fetch');
const cityTimezones = require('city-timezones');

let lastCalled = 0; // In-memory cooldown timestamp

function pad(n) {
  return n < 10 ? '0' + n : n;
}

// Apply UTC offset (e.g., "+01:00", "-05:00") to a Date object (in UTC)
function applyUtcOffset(dateObj, utcOffset) {
  const match = utcOffset.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!match) return dateObj;
  const sign = match[1] === '+' ? 1 : -1;
  const hours = parseInt(match[2], 10);
  const minutes = parseInt(match[3], 10);
  // Calculate total offset in milliseconds
  const offsetMs = sign * ((hours * 60 + minutes) * 60 * 1000);
  return new Date(dateObj.getTime() + offsetMs);
}

function formatDate(dateObj) {
  const hours = pad(dateObj.getHours());
  const minutes = pad(dateObj.getMinutes());
  const month = pad(dateObj.getMonth() + 1);
  const day = pad(dateObj.getDate());
  const year = dateObj.getFullYear();
  return `${hours}:${minutes} | ${month}/${day}/${year}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const now = Date.now();
  const COOLDOWN = 60 * 1000; // 60 seconds
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

  // Use cityTimezones to look up the city name and get a timezone name for the API
  const matches = cityTimezones.lookupViaCity(query);

  let tz;
  let locationLabel;

  if (matches.length > 0) {
    // Sort: prioritize higher population, then country code == US, then just first
    matches.sort((a, b) => {
      const usStates = [
        "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"
      ];
      const userQueryUpper = query.toUpperCase();
      const aIsUS = a.country === 'United States' || (a.iso2 === 'US');
      const bIsUS = b.country === 'United States' || (b.iso2 === 'US');
      const aHasState = usStates.some(st => userQueryUpper.includes(st));
      const bHasState = usStates.some(st => userQueryUpper.includes(st));
      if (aIsUS && !bIsUS) return -1;
      if (!aIsUS && bIsUS) return 1;
      if (aHasState && !bHasState) return -1;
      if (!aHasState && bHasState) return 1;
      if (b.population && a.population) return b.population - a.population;
      return 0;
    });

    const found = matches[0];
    tz = found.timezone; // THIS is e.g., "America/Chicago"
    locationLabel = `${found.city}, ${found.region || found.country}`;
  } else {
    // If not found in cityTimezones, try to use a direct match to timezone
    // This is fallback - almost always unsuccessful for US cities, but may help for "Europe/London", etc
    tz = query.replace(/ /g, '_');
    locationLabel = query;
  }

  // Always use tz for the API call, never the raw query!
  let timeApiUrl = `https://worldtimeapi.org/api/timezone/${encodeURIComponent(tz)}`;
  let apiResult;
 
