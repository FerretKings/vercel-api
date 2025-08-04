// /api/sunrise.js
// Vercel serverless function for returning sunrise/sunset times and local time for a location via ipgeolocation.io Astronomy API

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

    // Error handling if the API returns an error or missing fields
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

    // Build location string from city, state_prov, and country_name
    let location = "";
    if (typeof astroData.location === 'object') {
      if (astroData.location.city) location += astroData.location.city;
      if (astroData.location.state_prov) location += (location ? ', ' : '') + astroData.location.state_prov;
      if (astroData.location.country_name) location += (location ? ', ' : '') + astroData.location.country_name;
    } else if (typeof astroData.location === 'string') {
      location = astroData.location;
    }

    if (!location) location = 'Location';

    // Format sunrise, sunset, and current_time as HH:MM (drop seconds/fractions)
    const sunrise = astroData.sunrise.slice(0, 5);
    const sunset = astroData.sunset.slice(0, 5);
    const currentTime = astroData.current_time.slice(0, 5);

    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(`${location} Sunrise: ${sunrise} / Sunset: ${sunset} | Local Time: ${currentTime}`);
  } catch (e) {
    res.status(500).send('Could not find location or retrieve sunrise/sunset times. Please check your input.');
  }
}
