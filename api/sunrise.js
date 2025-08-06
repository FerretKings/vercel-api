export default async function handler(req, res) {
  const input = (req.query.q || '').trim();
  const apiKey = process.env.API_IPGEOLOC;

  if (!apiKey || !input) {
    res.status(400).send('Could not find location or retrieve sunrise/sunset times. Please check your input.');
    return;
  }

  function parseUserInput(input) {
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

  function parseUSDate(input) {
    if (!input) return null;
    const regex = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2}|\d{4})$/;
    const match = input.match(regex);
    if (!match) return null;
    let [ , m, d, y ] = match;
    m = parseInt(m, 10);
    d = parseInt(d, 10);
    y = parseInt(y, 10);
    if (y < 100) { y += (y < 50 ? 2000 : 1900); }
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const mm = m < 10 ? `0${m}` : `${m}`;
    const dd = d < 10 ? `0${d}` : `${d}`;
    return `${y}-${mm}-${dd}`;
  }

  const { city, date: userDate } = parseUserInput(input);

  if (!city) {
    res.status(400).send('Please provide a city name.');
    return;
  }

  try {
    // Step 1: Always get the location info (and today's astronomy data for that city)
    let locationAstroUrl = `https://api.ipgeolocation.io/v2/astronomy?apiKey=${apiKey}&location=${encodeURIComponent(city)}`;
    const locationAstroResp = await fetch(locationAstroUrl);
    const locationAstroData = await locationAstroResp.json();

    console.log('Location API URL:', locationAstroUrl);
    console.log('Location API response:', JSON.stringify(locationAstroData));

    const loc = locationAstroData?.location;
    const astronomy = locationAstroData?.astronomy;

    if (!loc) {
      console.error('Missing location. Raw location object:', JSON.stringify(loc));
      res.status(404).send('Could not find location or retrieve sunrise/sunset times. Please check your input.');
      return;
    }

    // Step 2: Decide the date to use
    let apiDate = '';
    if (userDate) {
      apiDate = parseUSDate(userDate);
      if (!apiDate) {
        console.error('Invalid date format received:', userDate);
        res.status(400).send('Invalid date format. Please use mm/dd/yyyy, m/d/yy, etc.');
        return;
      }
    } else {
      // Use the astronomy.date provided, which is "today" in that city
      apiDate = astronomy?.date;
    }

    // Step 3: If user requested today or gave no date, use already-fetched data
    let astronomyData, usedApiData = false;
    if (!userDate || (astronomy && astronomy.date === apiDate)) {
      astronomyData = astronomy;
      usedApiData = true;
    } else {
      // Otherwise, fetch for the requested date
      let astroUrl = `https://api.ipgeolocation.io/v2/astronomy?apiKey=${apiKey}&location=${encodeURIComponent(city)}&date=${encodeURIComponent(apiDate)}`;
      const astroResp = await fetch(astroUrl);
      const astroData = await astroResp.json();

      console.log('Astronomy API URL:', astroUrl);
      console.log('Astronomy API response:', JSON.stringify(astroData));

      astronomyData = astroData?.astronomy;
      // Optionally, update loc with new data if needed
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
