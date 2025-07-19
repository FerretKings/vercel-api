import fetch from 'node-fetch';
import cityTimezones from 'city-timezones';

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

export default async function handler(req, res) {
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

  const matches = cityTimezones.lookupViaCity(query);

  let tz;
  let locationLabel;
  if (matches.length > 0) {
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
    tz = found.timezone;
    locationLabel = `${found.city}, ${found.region || found.country}`;
  } else {
    tz = query.replace(/ /g, '_');
    locationLabel = query;
  }

  let timeApiUrl = `https://worldtimeapi.org/api/timezone/${encodeURIComponent(tz)}`;
  let apiResult;
  try {
    let apiRes = await fetch(timeApiUrl);
    if (apiRes.status === 404 && matches.length > 0) {
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

  lastCalled = Date.now();

  // Parse UTC datetime and apply UTC offset to get local time
  const baseUtcDate = new Date(apiResult.datetime);
  const localDate = applyUtcOffset(baseUtcDate, apiResult.utc_offset);
  const utcOffset = apiResult.utc_offset; // e.g., "+01:00"
  const offsetShort = utcOffset.replace(/^([+-]\d{2}):(\d{2})$/, '$1');
  const utcString = `UTC Conversion ${offsetShort}`;

  let locLabel = locationLabel.replace(/_/g, ' ');
  let locParts = locLabel.split(',').map(x => x.trim());
  if (locParts.length > 1 && locParts[1].toLowerCase() === locParts[0].toLowerCase()) locParts.pop();
  locLabel = locParts.join(', ');

  const response = `Current time in ${locLabel}: ${formatDate(localDate)} (${utcString})`;

  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send(response);
}
