const fetch = require('node-fetch');
const cityTimezones = require('city-timezones');

let lastCalled = 0; // In-memory cooldown timestamp

/**
 * Helper to pad numbers with leading zero
 */
function pad(n) {
  return n < 10 ? '0' + n : n;
}

/**
 * Formats a JS Date to HH:MM | MM/DD/YYYY
 */
function formatDate(dateObj) {
  const hours = pad(dateObj.getHours());
  const minutes = pad(dateObj.getMinutes());
  const month = pad(dateObj.getMonth() + 1);
  const day = pad(dateObj.getDate());
  const year = dateObj.getFullYear();
  return `${hours}:${minutes} | ${month}/${day}/${year}`;
}

/**
 * Main handler
 */
module.exports = async (req, res) => {
  // Enforce method
  if (req.method !== 'GET') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  // Rate limiting (cooldown)
  const now = Date.now();
  const COOLDOWN = 60 * 1000; // 60 seconds
  if (now - lastCalled < COOLDOWN) {
    const secondsLeft = Math.ceil((COOLDOWN - (now - lastCalled)) / 1000);
    res.setHeader('Content-Type', 'text/plain');
    res.status(429).send(`Cooldown in effect, try again in ${secondsLeft} seconds.`);
    return;
  }

  // Get user query
  const query = (req.query.query || req.query.q || '').trim();
  if (!query) {
    res.setHeader('Content-Type', 'text/plain');
    res.status(400).send('Please provide a location, e.g., !localtime London');
    return;
  }

  // City lookup (try to find the best match)
  const matches = cityTimezones.lookupViaCity(query);

  let tz;
  let locationLabel;
  if (matches.length > 0) {
    // Sort: prioritize higher population, then country code == US, then just first
    matches.sort((a, b) => {
      // Prefer US first if both are ambiguous and user input has US state
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
      // Prefer higher population if available
      if (b.population && a.population) return b.population - a.population;
      return 0;
    });

    const found = matches[0];
    tz = found.timezone;
    locationLabel = `${found.city}, ${found.region || found.country}`;
  } else {
    // Try to match directly to API timezone list (like Europe/London etc)
    tz = query.replace(/ /g, '_');
    locationLabel = query;
  }

  // If still not a valid timezone, try fallback to major city timezones for US states
  let timeApiUrl = `https://worldtimeapi.org/api/timezone/${encodeURIComponent(tz)}`;
  let apiResult;
  try {
    let apiRes = await fetch(timeApiUrl);
    if (apiRes.status === 404 && matches.length > 0) {
      // Try region/country only
      tz = matches[0].timezone;
      timeApiUrl = `https://worldtimeapi.org/api/timezone/${encodeURIComponent(tz)}`;
      apiRes = await fetch(timeApiUrl);
    }
    if (apiRes.status !== 200) throw new Error('Not found');
    apiResult = await apiRes.json();
  } catch (e) {
    res.setHeader('Content-Type', 'text/plain');
    res.status(404).send('Invalid location specified, please try again in 1 minute.');
    return;
  }

  // Update cooldown timestamp
  lastCalled = Date.now();

  // Compose output
  // Example: "Current time in London, England: HH:MM | MM/DD/YYYY (UTC Conversion +1)"
  // Get time and UTC offset
  const dt = new Date(apiResult.datetime);
  const utcOffset = apiResult.utc_offset; // e.g., "+01:00"
  const offsetShort = utcOffset.replace(/^([+-]\d{2}):(\d{2})$/, '$1'); // "+01"
  const utcString = `UTC Conversion ${offsetShort}`;

  // Refine location label formatting
  let locLabel = locationLabel.replace(/_/g, ' ');
  let locParts = locLabel.split(',').map(x => x.trim());
  if (locParts.length > 1 && locParts[1].toLowerCase() === locParts[0].toLowerCase()) locParts.pop(); // Remove duplicate
  locLabel = locParts.join(', ');

  // Compose final text
  const response = `Current time in ${locLabel}: ${formatDate(dt)} (${utcString})`;

  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send(response);
};
