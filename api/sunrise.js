export default async function handler(req, res) {
  const query = (req.query.q || '').trim();
  const apiKey = process.env.API_IPGEOLOC;

  if (!apiKey || !query) {
    res.status(400).send('Could not find location or retrieve sunrise/sunset times. Please check your input.');
    return;
  }

  try {
    const astroUrl = `https://api.ipgeolocation.io/v2/astronomy?apiKey=${apiKey}&location=${encodeURIComponent(query)}`;
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

    // Final output
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(
      `${locationLabel} | ${formattedDate} | Sunrise: ${sunrise} / Sunset: ${sunset} | Local Time: ${currentTime}`
    );
  } catch (e) {
    res.status(500).send('Could not find location or retrieve sunrise/sunset times. Please check your input.');
  }
}
