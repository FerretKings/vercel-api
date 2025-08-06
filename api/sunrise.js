export default async function handler(req, res) {
  const query = (req.query.q || '').trim();
  const userDate = (req.query.date || '').trim(); // Accept user date in many formats
  const apiKey = process.env.API_IPGEOLOC;

  if (!apiKey || !query) {
    res.status(400).send('Could not find location or retrieve sunrise/sunset times. Please check your input.');
    return;
  }

  // Helper to convert mm/dd/yyyy, m/d/yy, etc. to yyyy-mm-dd
  function parseUSDate(input) {
    if (!input) return null;
    // Acceptable: mm/dd/yyyy or m/d/yyyy or mm/dd/yy or m/d/yy (with or without leading zeroes)
    // Optional: allow separators /, -, or .
    const regex = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2}|\d{4})$/;
    const match = input.match(regex);
    if (!match) return null;
    let [ , m, d, y ] = match;
    m = parseInt(m, 10);
    d = parseInt(d, 10);
    y = parseInt(y, 10);
    if (y < 100) { // Two digit year, assume 2000-2099
      y += (y < 50 ? 2000 : 1900);
    }
    // Quick validation
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    // Pad month and day to 2 digits for API
    const mm = m < 10 ? `0${m}` : `${m}`;
    const dd = d < 10 ? `0${d}` : `${d}`;
    return `${y}-${mm}-${dd}`;
  }

  // If no date supplied, use today in yyyy-mm-dd
  function todayYMD() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const d = now.getDate();
    const mm = m < 10 ? `0${m}` : `${m}`;
    const dd = d < 10 ? `0${d}` : `${d}`;
    return `${y}-${mm}-${dd}`;
  }

  let apiDate = '';
  if (userDate) {
    apiDate = parseUSDate(userDate);
    if (!apiDate) {
      res.status(400).send('Invalid date format. Please use mm/dd/yyyy, m/d/yy, etc.');
      return;
    }
  } else {
    apiDate = todayYMD();
  }

  try {
    let astroUrl = `https://api.ipgeolocation.io/v2/astronomy?apiKey=${apiKey}&location=${encodeURIComponent(query)}`;
    if (apiDate) {
      astroUrl += `&date=${encodeURIComponent(apiDate)}`;
    }

    const astroResp = await fetch(astroUrl);
    const astroData = await astroResp.json();

    const loc = astroData?.location;
    const astronomy = astroData?.astronomy;

    if (
      !loc ||
      loc.latitude === undefined ||
      loc.longitude === undefined ||
      !astronomy ||
      !astronomy.sunrise ||
      !astronomy.sunset ||
      !astronomy.current_time ||
      !astronomy.date
    ) {
      res.status(404).send('Could not find location or retrieve sunrise/sunset times. Please check your input.');
      return;
    }

    // Build location label: City, State, Country
    let labelParts = [];
    if (loc.city) labelParts.push(loc.city);
    if (loc.state_prov) labelParts.push(loc.state_prov);
    if (loc.country_name) labelParts.push(loc.country_name);
    const locationLabel = labelParts.length ? labelParts.join(', ') : (loc.location_string || 'Location');

    // Format the date as "Tuesday, 8/5/2025"
    const dateStr = astronomy.date; // format: "2025-08-05"
    const [year, month, day] = dateStr.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const daysOfWeek = [
      'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
    ];
    const dayOfWeek = daysOfWeek[dateObj.getDay()];
    const formattedDate = `${dayOfWeek}, ${month}/${day}/${year}`;

    // Format times
    const sunrise = astronomy.sunrise.slice(0, 5);
    const sunset = astronomy.sunset.slice(0, 5);
    const currentTime = astronomy.current_time.slice(0, 5);

    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(
      `${locationLabel} | ${formattedDate} | Sunrise: ${sunrise} / Sunset: ${sunset} | Local Time: ${currentTime}`
    );
  } catch (e) {
    res.status(500).send('Could not find location or retrieve sunrise/sunset times. Please check your input.');
  }
}
