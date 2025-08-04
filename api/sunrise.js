export default async function handler(req, res) {
  const query = (req.query.q || '').trim();
  const apiKey = process.env.API_IPGEOLOC;

  if (!apiKey || !query) {
    res.status(400).send('Could not find location or retrieve sunrise/sunset times. Please check your input.');
    return;
  }

  try {
    const astroUrl = `https://api.ipgeolocation.io/astronomy?apiKey=${apiKey}&location=${encodeURIComponent(query)}`;
    const astroResp = await fetch(astroUrl);
    const astroData = await astroResp.json();

    if (
      !astroData ||
      !astroData.sunrise ||
      !astroData.sunset ||
      !astroData.current_time
    ) {
      res.status(404).send('Could not find location or retrieve sunrise/sunset times. Please check your input.');
      return;
    }

    // Use top-level fields from the Astronomy API response
    let location = "";
    if (astroData.city) {
      location += astroData.city;
      if (astroData.state_prov) {
        location += `, ${astroData.state_prov}`;
      } else if (astroData.country_name) {
        location += `, ${astroData.country_name}`;
      }
    } else if (astroData.state_prov) {
      location += astroData.state_prov;
    } else if (astroData.country_name) {
      location += astroData.country_name;
    } else if (astroData.location) {
      // Fallback if location is a string
      location = typeof astroData.location === 'string' ? astroData.location : 'Location';
    } else {
      location = 'Location';
    }

    const sunrise = astroData.sunrise.slice(0, 5);
    const sunset = astroData.sunset.slice(0, 5);
    const currentTime = astroData.current_time.slice(0, 5);

    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(`${location} Sunrise: ${sunrise} / Sunset: ${sunset} | Local Time: ${currentTime}`);
  } catch (e) {
    res.status(500).send('Could not find location or retrieve sunrise/sunset times. Please check your input.');
  }
}
