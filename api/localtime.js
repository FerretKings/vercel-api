const fs = require('fs');
const path = require('path');

// US state codes and names for flexible matching
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
// Also build reverse lookup for state name → code
const stateNameToCode = Object.fromEntries(
  Object.entries(usStates).map(([code, name]) => [name.toLowerCase(), code])
);

function pad2(n) { return n < 10 ? '0' + n : n; }

let cities = null;

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
        admin1: cols[10], // State/region code (for US)
        timezone: cols[17],
        population: parseInt(cols[14] || "0", 10)
      };
    });
  return cities;
}

// Parse input like "Paris Texas", "Paris, Texas", "Paris, TX", "Paris TX", "Paris, Texas, US" etc.
function parseInput(input) {
  // Accept both comma and space separated tokens, but treat quoted phrases as single (e.g., "New York")
  // Split on comma first, or fallback to spaces if no commas present
  let parts = input.includes(',')
    ? input.split(',').map(p => p.trim())
    : input.trim().split(/\s+/);

  // Merge consecutive tokens for multi-word city/state names (e.g., "New York", "Los Angeles")
  // Strategy: Always treat first token(s) as city, rest as possible state/country
  let city = parts[0];
  let admin1 = null;
  let country = null;

  if (parts.length > 1) {
    // If next part is a US state code or full name, treat as admin1
    let part1 = parts[1].toLowerCase();
    if (usStates[part1.toUpperCase()]) {
      admin1 = part1.toUpperCase();
    } else if (stateNameToCode[part1]) {
      admin1 = stateNameToCode[part1];
    } else {
      admin1 = parts[1];
    }
  }
  if (parts.length > 2) {
    country = parts[2].toUpperCase();
  }
  return { city, admin1, country };
}

// Flexible matching: city+state (US) or city+region/country (elsewhere)
function findCityFlexible(query) {
  const { city, admin1, country } = parseInput(query);
  const cities = loadCities();

  // 1. Fuzzy match city name (case-insensitive, exact or asciiname)
  let matches = cities.filter(c =>
    c.name.toLowerCase() === city.toLowerCase() ||
    c.asciiname.toLowerCase() === city.toLowerCase()
  );

  if (admin1) {
    // If admin1 is a US state code, filter for US only, otherwise match globally
    if (usStates[admin1]) {
      matches = matches.filter(c =>
        c.country === "US" && c.admin1 === admin1
      );
    } else if (stateNameToCode[admin1.toLowerCase()]) {
      // Full state name (normalize to code)
      const code = stateNameToCode[admin1.toLowerCase()];
      matches = matches.filter(c =>
        c.country === "US" && c.admin1 === code
      );
    } else {
      // Non-US: try to match admin1 against GeoNames admin1 code or alternatenames
      matches = matches.filter(c =>
        (c.admin1 && c.admin1.toLowerCase() === admin1.toLowerCase()) ||
        (c.alternatenames && c.alternatenames.toLowerCase().includes(admin1.toLowerCase()))
      );
    }
  }

  if (country) {
    matches = matches.filter(c =>
      c.country.toLowerCase() === country.toLowerCase()
    );
  }

  // 2. If multiple matches, pick most populous
  if (matches.length > 1) {
    matches.sort((a, b) => b.population - a.population);
  }
  return matches[0] || null;
}

// Get UTC offset in hours (e.g. -5) for a given IANA timezone and date
function getUtcOffset(tz, date = new Date()) {
  const local = new Date(date.toLocaleString('en-US', { timeZone: tz }));
  const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMin = Math.round((local - utc) / 60000);
  const offsetHr = offsetMin / 60;
  return offsetHr;
}

function formatCityOutput(city, now = new Date()) {
  let location = city.name;
  if (city.country === "US" && city.admin1 && usStates[city.admin1]) {
    location += `, ${usStates[city.admin1]}`;
  } else if (city.country === "US" && city.admin1) {
    location += `, ${city.admin1}`;
  }
  if (city.country === "US") {
    location += " (USA)";
  } else {
    location += ` (${city.country})`;
  }

  const localDate = new Date(now.toLocaleString('en-US', { timeZone: city.timezone }));
  const hour = pad2(localDate.getHours());
  const min = pad2(localDate.getMinutes());
  const month = pad2(localDate.getMonth() + 1);
  const day = pad2(localDate.getDate());
  const year = localDate.getFullYear();

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

  const city = findCityFlexible(query);
  if (!city) {
    res.status(404).send('Could not find that city in the database.');
    return;
  }

  const output = formatCityOutput(city);
  res.status(200).send(output);
};
