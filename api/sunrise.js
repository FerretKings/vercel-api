export default async function handler(req, res) {
  const query = (req.query.q || '').trim();
  const apiKey = process.env.API_IPGEOLOC;

  if (!apiKey || !query) {
    res.status(400).send('Could not find location or retrieve sunrise/sunset times. Please check your input.');
    return;
  }

  try {
    // Directly use user input as "location"
    const astroUrl = `https://api.ipgeolocation.io/astronomy?apiKey=${apiKey}&location=${encodeURIComponent(query)}`;
    const astroResp = await fetch(astroUrl);
    const astroData = await astroResp.json();

    const loc = astroData?.location;
    const astronomy = astroData?.astronomy;

    // Defensive: Check required fields
    if (!loc || !astronomy || !astronomy.sunrise || !astronomy.sunset || !astronomy.current_time) {
      res.status(404).send('Could not find location or retrieve sunrise/sunset times. Please check your input.');
      return;
    }

    // Build location label: City, State (if available), Country (if no state)
    let locationLabel = '';
    if (loc.city) {
      locationLabel += loc.city;
      if (loc.state_prov) {
        locationLabel += `, ${loc.state_prov}`;
      } else if (loc.country_name) {
        locationLabel += `, ${loc.country_name}`;
      }
    } else if (loc.state_prov) {
      locationLabel += loc.state_prov;
    } else if (loc.country_name) {
      locationLabel += loc.country_name;
    } else if (loc.location_string) {
      locationLabel += loc.location_string;
    } else {
      locationLabel = 'Location';
    }

    // Format times
    const sunrise = astronomy.sunrise.slice(0, 5);
    const sunset = astronomy.sunset.slice(0, 5);
    const currentTime = astronomy.current_time.slice(0, 5);

    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(`${locationLabel} Sunrise: ${sunrise} / Sunset: ${sunset} | Local Time: ${currentTime}`);
  } catch (e) {
    res.status(500).send('Could not find location or retrieve sunrise/sunset times. Please check your input.');
  }
}
