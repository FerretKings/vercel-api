export default async function handler(req, res) {
  const query = (req.query.q || '').trim();
  const apiKey = process.env.API_IPGEOLOC;

  if (!apiKey || !query) {
    res.status(400).send('Could not find location or retrieve sunrise/sunset times. Please check your input.');
    return;
  }

  // Smartly format location parts: city/country title case, 2-letter state/province upper
  function formatLocation(str) {
    return str.split(',')
      .map((part, idx) => {
        const trimmed = part.trim();
        // If 2-letter and not first part, likely a state/province abbreviation
        if (/^[a-zA-Z]{2}$/.test(trimmed) && idx > 0) {
          return trimmed.toUpperCase();
        }
        // Otherwise, title case
        return trimmed.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
      })
      .join(', ');
  }

  const formattedQuery = formatLocation(query);

  try {
    const astroUrl = `https://api.ipgeolocation.io/astronomy?apiKey=${apiKey}&location=${encodeURIComponent(formattedQuery)}`;
    const astroResp = await fetch(astroUrl);
    const astroData = await astroResp.json();

    // Defensive: Check for both new and fallback fields
    const locationStr = astroData?.location?.location_string || astroData?.location || "";
    const sunrise = astroData?.astronomy?.sunrise;
    const sunset = astroData?.astronomy?.sunset;
    const currentTime = astroData?.astronomy?.current_time;

    if (!locationStr || !sunrise || !sunset || !currentTime) {
      res.status(404).send('Could not find location or retrieve sunrise/sunset times. Please check your input.');
      return;
    }

    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(`${locationStr} Sunrise: ${sunrise.slice(0,5)} / Sunset: ${sunset.slice(0,5)} | Local Time: ${currentTime.slice(0,5)}`);
  } catch (e) {
    res.status(500).send('Could not find location or retrieve sunrise/sunset times. Please check your input.');
  }
}
