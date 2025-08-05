export default async function handler(req, res) {
  const query = (req.query.q || '').trim();
  const apiKey = process.env.API_IPGEOLOC;

  if (!apiKey || !query) {
    res.status(400).send('Could not find location or retrieve sunrise/sunset times. Please check your input.');
    return;
  }

  try {
    // Use Astronomy API with location parameter
    const astroUrl = `https://api.ipgeolocation.io/astronomy?apiKey=${apiKey}&location=${encodeURIComponent(query)}`;
    const astroResp = await fetch(astroUrl);
    const astroData = await astroResp.json();

    // Validate structure
    if (
      !astroData ||
      !astroData.location ||
      !astroData.location.location_string ||
      !astroData.astronomy ||
      !astroData.astronomy.sunrise ||
      !astroData.astronomy.sunset ||
      !astroData.astronomy.current_time
    ) {
      res.status(404).send('Could not find location or retrieve sunrise/sunset times. Please check your input.');
      return;
    }

    // Use location_string directly
    const location = astroData.location.location_string;

    // Format sunrise, sunset, and current_time as HH:MM
    const sunrise = astroData.astronomy.sunrise.slice(0, 5);
    const sunset = astroData.astronomy.sunset.slice(0, 5);
    const currentTime = astroData.astronomy.current_time.slice(0, 5);

    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(`${location} Sunrise: ${sunrise} / Sunset: ${sunset} | Local Time: ${currentTime}`);
  } catch (e) {
    res.status(500).send('Could not find location or retrieve sunrise/sunset times. Please check your input.');
  }
}
