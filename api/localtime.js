const fetch = require('node-fetch');
const cityTimezones = require('city-timezones');

let lastCalled = 0; // In-memory cooldown timestamp

function pad(n) {
  return n < 10 ? '0' + n : n;
}

function applyUtcOffset(dateObj, utcOffset) {
  const match = utcOffset.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!match) return dateObj;
  const sign = match[1] === '+' ? 1 : -1;
  const hours = parseInt(match[2], 10);
  const minutes = parseInt(match[3], 10);
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

  // Always use the timezone from cityTimezones if available
  const matches = cityTimezones.lookupViaCity(query);

  let tz;
  let locationLabel;
  if (matches.length > 0 && matches[0].timezone) {
    tz = matches[0].timezone;
    locationLabel = `${matches[0].city}, ${matches[0].region || matches[0].country}`;
  } else {
    // If the lookup fails, fail gracefully and don't try to use the query as a timezone!
    res.setHeader('Content-Type', 'text/plain');
    res.status(404).send('Could not find a timezone for that city. Try a major city or check your spelling.');
    return;
  }

  let timeApiUrl = `https://worldtimeapi.org/api/timezone/${encodeURIComponent(tz)}`;
  let apiResult;
  try {
    let apiRes = await fetch(timeApiUrl);
    if (apiRes.status !== 200) throw new Error('Not found');
    apiResult = await apiRes.json();
  } catch (e) {
    res.setHeader('Content-Type', 'text/plain');
    res.status(404).send('Invalid location specified, please try again in 1 minute.');
    return;
  }

  lastCalled = Date.now();

  const baseUtcDate = new Date(apiResult.datetime);
  const localDate = applyUtcOffset(baseUtcDate, apiResult.utc_offset);
  const utcOffset = apiResult.utc_offset;
  const offsetShort = utcOffset.replace(/^([+-]\d{2}):(\d{2})$/, '$1');
  const utcString = `UTC Conversion ${offsetShort}`;

  let locLabel = locationLabel.replace(/_/g, ' ');
  let locParts = locLabel.split(',').map(x => x.trim());
  if (locParts.length > 1 && locParts[1].toLowerCase() === locParts[0].toLowerCase()) locParts.pop();
  locLabel = locParts.join(', ');

  const response = `Current time in ${locLabel}: ${formatDate(localDate)} (${utcString})`;

  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send(response);
};
