const fs = require('fs');
const path = require('path');

// GeoNames cities5000.txt columns reference:
// 0 geonameid, 1 name, 2 asciiname, 3 alternatenames,
// 4 latitude, 5 longitude, 6 feature class, 7 feature code,
// 8 country code, 9 cc2, 10 admin1 code (state), 11 admin2 code (county),
// 12 admin3 code, 13 admin4 code, 14 population, 15 elevation,
// 16 dem, 17 timezone, 18 modification date

let cities = null;

// Load and cache city data
function loadCities() {
  if (cities) return cities;
  const filePath = path.join(__dirname, 'cities5000.txt');
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  // Parse and map to objects for easier searching
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
  let matches = cities.filter(city => city.name.toLowerCase() === parts[0] || city.asciiname.toLowerCase() === parts[0]);

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

module.exports = async (req, res) => {
  const query = (req.query.query || req.query.q || '').trim();
  if (!query) {
    res.status(400).send('Please provide a city, e.g., !localtime London or !localtime Springfield, MO, US');
    return;
  }

  const city = findCity(query);
  if (!city) {
    res.status(404).send('Could not find that city in the database.');
    return;
  }

  // You can add code here to call TimeZoneDB using city.timezone or city.latitude/longitude for live time
  // For now, just echo the timezone info:
  res.status(200).send(
    `City: ${city.name}, Country: ${city.country}, Timezone: ${city.timezone}, Population: ${city.population}`
  );
};
