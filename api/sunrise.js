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
    // First, use ipgeolocation.io's Geolocation API to get lat/lon for city/state/country input
    const geoUrl = `https://api.ipgeolocation.io/ipgeo?apiKey=${apiKey}&city=${encodeURIComponent(query)}`;
    const geoResp = await fetch(geoUrl);
    const geoData = await geoResp.json();

    // Check if valid lat/lon returned
    if (!geoData || !geoData.latitude || !geoData.longitude) {
      res.status(404).send('Could not find location or retrieve sunrise/sunset times. Please check your input.');
      return;
    }

    // Use Astronomy API to get sunrise and sunset
    const astroUrl = `https://api.ipgeolocation.io/astronomy?apiKey=${apiKey}&lat=${geoData.latitude}&long=${geoData.longitude}`;
    const astroResp = await fetch(astroUrl);
    const astroData = await astroResp.json();

    if (!astroData || !astroData.sunrise || !astroData.sunset || !astroData.current_time) {
      res.status(404).send('Could not find location or retrieve sunrise/sunset times. Please check your input.');
      return;
    }

    // Compose location string from geolocation data
    let location = '';
    if (geoData.city) location += geoData.city;
    if (geoData.state_prov) location += (location ? ', ' : '') + geoData.state_prov;
    // If city or state_prov missing, fall back to country
    if (!location && geoData.country_name) location = geoData.country_name;
    if (!location) location = 'Location';

    // Format sunrise/sunset/current_time (HH:MM)
    const sunrise = astroData.sunrise.slice(0,5); // 'HH:MM'
    const sunset = astroData.sunset.slice(0,5);   // 'HH:MM'
    const currentTime = astroData.current_time.slice(0,5); // 'HH:MM'

    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(`${location} Sunrise: ${sunrise} / Sunset: ${sunset} | Local Time: ${currentTime}`);
  } catch (e) {
    res.status(500).send('Could not find location or retrieve sunrise/sunset times. Please check your input.');
  }
}
