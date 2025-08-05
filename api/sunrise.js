export default async function handler(req, res) {
  const query = (req.query.q || '').trim();
  const apiKey = process.env.API_IPGEOLOC;

  if (!apiKey || !query) {
    res.status(400).send('Could not find location or retrieve sunrise/sunset times. Please check your input.');
    return;
  }

  try {
    // Use the user's input as the location parameter, as the API is robust to case and punctuation.
    const astroUrl = `https://api.ipgeolocation.io/v2/astronomy?apiKey=${apiKey}&location=${encodeURIComponent(query)}`;
    const astroResp = await fetch(astroUrl);
    const astroData = await astroResp.json();

    const loc = astroData?.location;
    const astronomy = astroData?.astronomy;

    // Validate presence of location and astronomy objects, plus latitude and longitude (should never be missing if a location is found), and sunrise/sunset/current_time fields
    if (
      !loc ||
      loc.latitude === undefined ||
      loc.longitude === undefined ||
      !astronomy ||
      !astronomy.sunrise ||
      !astronomy.sunset ||
      !astronomy.current_time
    ) {
      res.status(404).send('Could not find location or retrieve sunrise/sunset times. Please check your input.');
      return;
    }

    // Build a location label from available fields
    let labelParts = [];
    if (loc.city) labelParts.push(loc.city);
    if (loc.state_prov) labelParts.push(loc.state_prov);
    if (loc.country_name) labelParts.push(loc.country_name);
    const locationLabel = labelParts.length ? labelParts.join(', ') : (loc.location_string || 'Location');

    // Format times to HH:mm (API guarantees this unless a timezone is supplied)
    const sunrise = astronomy.sunrise.slice(0, 5);
    const sunset = astronomy.sunset.slice(0, 5);
    const currentTime = astronomy.current_time.slice(0, 5);

    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(`${locationLabel} Sunrise: ${sunrise} / Sunset: ${sunset} | Local Time: ${currentTime}`);
  } catch (e) {
    res.status(500).send('Could not find location or retrieve sunrise/sunset times. Please check your input.');
  }
}
