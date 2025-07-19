const fs = require('fs');
const path = require('path');

// GeoNames cities5000.txt columns reference:
// 0 geonameid, 1 name, 2 asciiname, 3 alternatenames,
// 4 latitude, 5 longitude, 6 feature class, 7 feature code,
// 8 country code, 9 cc2, 10 admin1 code (state), 11 admin2 code (county),
// 12 admin3 code, 13 admin4 code, 14 population, 15 elevation,
// 16 dem, 17 timezone, 18 modification date

let cities = null;

// US state codes to full names (for output formatting)
const usStates = {
  "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California", "CO": "Colorado",
  "CT": "Connecticut", "DE": "Delaware", "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho",
  "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana",
  "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota",
  "MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
  "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York", "NC": "North Carolina",
  "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania",
  "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas",
  "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia",
  "WI": "Wisconsin", "WY": "Wyoming"
};

function pad2(n) { return n < 10 ? '0' + n : n; }

// Load and cache city data
function loadCities() {
  if (cities) return cities;
  const filePath = path.join(__dirname, 'cities5000.txt');
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  cities = lines
    .filter(Boolean)
    .map(line => {
      const cols = line.split('\t');
      return {
        name: cols[1],
        asciiname: cols[2],
        alternatenames: cols[3],
        latitude: cols[4],
        longitude: cols[5],
        country: cols[8],
        admin1: cols[10], // State/region code
        timezone: cols[17],
        population: parseInt(cols[14] || "0", 10)
      };
    });
  return cities;
}

// Simple matching, supports: "City", "City, State", "City, State, Country"
function findCity(query) {
  const parts = query.split(',').map(p => p.trim().toLowerCase());
  const cities = loadCities();
  let matches = cities.filter(city =>
    city.name.toLowerCase() === parts[0] || city.asciiname.toLowerCase() === parts[0]
  );

  if (parts.length > 1) {
    // Try to match admin1 (state) or alternatenames for US
    matches = matches.filter(city =>
      (city.admin1 && city.admin1.toLowerCase() === parts[1]) ||
      (city.alternatenames && city.alternatenames.toLowerCase().includes(parts[1]))
    );
  }
  if (parts.length > 2) {
    matches = matches.filter(city => city.country.toLowerCase() === parts[2]);
  }
  // Pick the largest-population match if possible
  if (matches.length > 1) {
    matches.sort((a, b) => b.population - a.population);
  }
  return matches[0] || null;
}

// Get UTC offset in hours (e.g. -5) for a given IANA timezone and JS Date
function getUtcOffset(tz, date = new Date()) {
  // DateTimeFormat gives offset in minutes as a string like "-05:00"
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  // get the offset in minutes by comparing UTC and local times
  const local = new Date(date.toLocaleString('en-US', { timeZone: tz }));
  const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMin = Math.round((local - utc) / 60000);
  const offsetHr = offsetMin / 60;
  return offsetHr;
}

function formatCityOutput(city, now = new Date()) {
  // Figure out a nice display string for the location
  let location = city.name;
  if (city.country === "US" && city.admin1 && usStates[city.admin1]) {
    location += `, ${usStates[city.admin1]}`;
  }
  else if (city.country === "US" && city.admin1) {
    location += `, ${city.admin1}`;
  }
  if (city.country === "US") {
    location += " (USA)";
  } else {
    location += ` (${city.country})`;
  }

  // Get the local time in the city's timezone
  const localDate = new Date(now.toLocaleString('en-US', { timeZone: city.timezone }));
  const hour = pad2(localDate.getHours());
  const min = pad2(localDate.getMinutes());
  const month = pad2(localDate.getMonth() + 1);
  const day = pad2(localDate.getDate());
  const year = localDate.getFullYear();

  // Get UTC offset
  const offset = getUtcOffset(city.timezone, now);
  const offsetStr = (offset >= 0) ? `+${offset}` : `${offset}`;

  return `Current time in ${location} is ${hour}:${min} | ${month}/${day}/${year} (UTC ${offsetStr})`;
}

module.exports = async (req, res) => {
  const query = (req.query.query || req.query.q || '').trim();
  if (!query) {
    res.status(400).send('Please provide a city, e.g., !localtime London or !localtime Springfield, MO');
    return;
  }

  const city = findCity(query);
  if (!city) {
    res.status(404).send('Could not find that city in the database.');
    return;
  }

  const output = formatCityOutput(city);
  res.status(200).send(output);
};
