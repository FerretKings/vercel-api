export default async function handler(req, res) {
  const { code } = req.query;
  // const API_KEY = process.env.AIRPORTDB_API_KEY;
  const API_KEY = "d2dbc2bbb32abef3572be1cdb7112ce85eb5dc969b4ac62ba5c4586fe7e6036a231295d7a64a5ad247885616a983b086";

  // Validate ICAO code (must be 4 uppercase letters)
  if (!code || !/^[A-Z]{4}$/.test(code.toUpperCase())) {
    res.status(200).send('Error: Please provide a valid 4-letter ICAO airport code, e.g. EGLL, KJFK, RJTT');
    return;
  }

  if (!API_KEY) {
    res.status(200).send('Error: API key is not configured on the server.');
    return;
  }

  try {
    const searchCode = code.toUpperCase();
    const url = `https://airportdb.io/api/v1/airport/${encodeURIComponent(searchCode)}?apiToken=${API_KEY}`;
    const response = await fetch(url);

    if (!response.ok) {
      res.status(200).send('Error: No airport found for that ICAO code.');
      return;
    }

    const data = await response.json();

    if (data && (data.name || data.iata_code || data.ident)) {
      const name = data.name || 'N/A';
      const elevation = data.elevation_ft ? `${data.elevation_ft}ft` : 'N/A';
      // Use full country name from nested country object
      const country = (data.country && data.country.name) ? data.country.name : 'N/A';
      const municipality = data.municipality || 'N/A';
      const iata = data.iata_code ? `IATA: ${data.iata_code}` : 'IATA: N/A';
      const wikipedia = data.wikipedia_link || 'N/A';

      // Add METAR/TAF link using the user-provided code (always uppercase) TRYING AGAIN!!!!
      const metarTafLink = `https://metar-taf.com/metar/${searchCode}`;

      const message = `${name}. Elev ${elevation}. ${country}. ${municipality}. ${iata}. ${wikipedia} | ${metarTafLink}`;
      res.status(200).send(message);
    } else {
      res.status(200).send('Error: No airport found for that ICAO code.');
    }
  } catch (err) {
    console.error('Error fetching airport info:', err);
    res.status(200).send('Error: There was a problem fetching airport info.');
  }
}
