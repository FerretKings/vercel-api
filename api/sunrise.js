export default async function handler(req, res) {
  // Get user input (e.g. "Dallas 8/6/25", "Bakersfield", "Dallas, TX 12/25/25")
  const input = (req.query.q || '').trim();
  const apiKey = process.env.API_IPGEOLOC;

  if (!apiKey || !input) {
    res.status(400).send('Could not find location or retrieve sunrise/sunset times. Please check your input.');
    return;
  }

  // --- 1. Parse input into city and date ---
  function parseUserInput(input) {
    // Flexible: date at end, separated by space, e.g. Dallas 8/6/25
    // Accepts formats like m/d/yy, mm/dd/yyyy, m-d-yy, mm.dd.yyyy, etc.
    const datePattern = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.](\d{2}|\d{4}))$/;
    const match = input.match(datePattern);
    let city, date;
    if (match) {
      date = match[1];
      city = input.replace(datePattern, '').trim().replace(/[\s,]+$/, '');
    } else {
      city = input.trim();
      date = null;
    }
    return { city, date };
  }

  // --- 2. Parse date string (mm/dd/yyyy, mm/dd/yy, etc.) to yyyy-mm-dd ---
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

  // --- 3. Get today's date in specified timezone (returns yyyy-mm-dd) ---
  function todayYMDInTimezone(tz) {
    const now = new Date();
    // Format: MM/DD/YYYY, HH:MM:SS AM/PM
    const localStr = now.toLocaleString('en-US', { timeZone: tz });
    const [mdy] = localStr.split(','); // MM/DD/YYYY
    const [month, day, year] = mdy.split('/').map(Number);
    const mm = month < 10 ? `0${month}` : `${month}`;
    const dd = day < 10 ? `0${day}` : `${day}`;
    return `${year}-${mm}-${dd}`;
  }

  // --- 4. Main logic ---
  const { city, date: userDate } = parseUserInput(input);

  if (!city) {
    res.status(400).send('Please provide a city name.');
    return;
  }

  try {
    // First, lookup city location (using the Astronomy API's location resolver)
    // We need the timezone to get today's date in that city if no date provided.
    // We'll call the API once with no date to get the location info.
    let locationAstroUrl = `https://api.ipgeolocation.io/v2/astronomy?apiKey=${apiKey}&location=${encodeURIComponent(city)}`;
    const locationAstroResp = await fetch(locationAstroUrl);
    const locationAstroData = await locationAstroResp.json();

    // --- Error logging for debugging ---
    console.log('Location API URL:', locationAstroUrl);
    console.log('Location API response:', JSON.stringify(locationAstroData));

    const loc = locationAstroData?.location;
    const astronomy = locationAstroData?.astronomy;

    // Relaxed: only require loc and loc.timezone minimally
    if (!loc || !loc.timezone) {
      console.error('Missing location or timezone. Raw location object:', JSON.stringify(loc));
      res.status(404).send('Could not find location or retrieve sunrise/sunset times. Please check your input.');
      return;
    }

    // --- 5. Decide the date to use ---
    let apiDate = '';
    if (userDate) {
      apiDate = parseUSDate(userDate);
      if (!apiDate) {
        console.error('Invalid date format received:', userDate);
        res.status(400).send('Invalid date format. Please use mm/dd/yyyy, m/d/yy, etc.');
        return;
      }
    } else {
      apiDate = todayYMDInTimezone(loc.timezone);
    }

    // If no date, we already have astronomy data for today; otherwise, fetch for desired date:
    let astroData, astronomyData;
    if (!userDate) {
      astroData = locationAstroData;
      astronomyData = astronomy;
    } else {
      let astroUrl = `https://api.ipgeolocation.io/v2/astronomy?apiKey=${apiKey}&location=${encodeURIComponent(city)}&date=${encodeURIComponent(apiDate)}`;
      const astroResp = await fetch(astroUrl);
      astroData = await astroResp.json();

      // --- Error logging for debugging ---
      console.log('Astronomy API URL:', astroUrl);
      console.log('Astronomy API response:', JSON.stringify(astroData));

      astronomyData = astroData?.astronomy;
    }

    if (
      !astronomyData ||
      !astronomyData.sunrise ||
      !astronomyData.sunset ||
      !astronomyData.current_time ||
      !astronomyData.date
    ) {
      console.error('Missing astronomy data or fields. Raw astronomy object:', JSON.stringify(astronomyData));
      res.status(404).send('Could not find astronomy info for that date and location.');
      return;
    }

    // Build location label: City, State, Country
    let labelParts = [];
    if (loc.city) labelParts.push(loc.city);
    if (loc.state_prov) labelParts.push(loc.state_prov);
    if (loc.country_name) labelParts.push(loc.country_name);
    const locationLabel = labelParts.length ? labelParts.join(', ') : (loc.location_string || 'Location');

    // Format the date as "DayOfWeek, m/d/yyyy"
    const dateStr = astronomyData.date; // format: "2025-08-06"
    const [year, month, day] = dateStr.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const daysOfWeek = [
      'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
    ];
    const dayOfWeek = daysOfWeek[dateObj.getDay()];
    const formattedDate = `${dayOfWeek}, ${month}/${day}/${year}`;

    // Format times
    const sunrise = astronomyData.sunrise.slice(0, 5);
    const sunset = astronomyData.sunset.slice(0, 5);
    const currentTime = astronomyData.current_time.slice(0, 5);

    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(
      `${locationLabel} | ${formattedDate} | Sunrise: ${sunrise} / Sunset: ${sunset} | Local Time: ${currentTime}`
    );
  } catch (e) {
    console.error('Unexpected error in /api/sunrise.js:', e);
    res.status(500).send('Could not find location or retrieve sunrise/sunset times. Please check your input.');
  }
}
