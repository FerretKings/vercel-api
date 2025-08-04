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

    if (
      !astroData ||
      !astroData.sunrise ||
      !astroData.sunset ||
      !astroData.current_time ||
      !astroData.location
    ) {
      res.status(404).send('Could not find location or retrieve sunrise/sunset times. Please check your input.');
      return;
    }

    // Flexible location logic
    let location = "";
    const loc = astroData.location;
    // Handles both object and string
    if (typeof loc === 'object' && loc !== null) {
      if (loc.city && loc.state_prov) {
        location = `${loc.city}, ${loc.state_prov}`;
      } else if (loc.city && loc.country_name) {
        location = `${loc.city}, ${loc.country_name}`;
      } else if (loc.city) {
        location = loc.city;
      } else if (loc.state_prov) {
        location = loc.state_prov;
      } else if (loc.country_name) {
        location = loc.country_name;
      }
    } else if (typeof loc === 'string') {
      location = loc;
    }

    if (!location) location = 'Unknown Location';

    // Format sunrise, sunset, and current_time as HH:MM
    const sunrise = astroData.sunrise.slice(0, 5);
    const sunset = astroData.sunset.slice(0, 5);
    const currentTime = astroData.current_time.slice(0, 5);

    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(`${location} Sunrise: ${sunrise} / Sunset: ${sunset} | Local Time: ${currentTime}`);
  } catch (e) {
    res.status(500).send('Could not find location or retrieve sunrise/sunset times. Please check your input.');
  }
}
