export default async function handler(req, res) {
  const { reg } = req.query;
  const API_KEY = process.env.AERODATABOX_API_KEY;
  const API_HOST = process.env.AERODATABOX_API_HOST || "aerodatabox.p.rapidapi.com";

  // Validate registration (should be at least 3 characters, alphanumeric or dash)
  if (!reg || !/^[A-Z0-9\-]{3,}$/.test(reg.toUpperCase())) {
    res.status(200).send('Error: Please provide a valid aircraft registration, e.g. N12345, G-ABCD, D-ABCD.');
    return;
  }

  if (!API_KEY) {
    res.status(200).send('Error: API key is not configured on the server.');
    return;
  }

  try {
    const searchReg = reg.toUpperCase();
    const url = `https://${API_HOST}/aircraft/registration/${encodeURIComponent(searchReg)}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-RapidAPI-Key": API_KEY,
        "X-RapidAPI-Host": API_HOST,
      },
    });

    if (!response.ok) {
      res.status(200).send('Aircraft not found.');
      return;
    }

    const data = await response.json();

    // Defensive: If no registration is found in response
    if (!data || !data.registration) {
      res.status(200).send('Aircraft not found.');
      return;
    }

    // Build reply
    const registration = data.registration || 'N/A';
    const icaoTypeCode = data.icaoTypeCode || 'N/A';
    const manufacturer = data.manufacturer || 'N/A';
    const model = data.model || 'N/A';
    const built = data.built || 'N/A';
    const engines = data.engines ? data.engines.model || data.engines.type || 'N/A' : 'N/A';
    const country = data.country || 'N/A';

    const message = `Registration: ${registration} | ${icaoTypeCode} | ${manufacturer} | ${model} | ${built} | ${engines} | ${country}`;
    res.status(200).send(message);
  } catch (err) {
    // Debug logging for Vercel
    console.error('Error fetching aircraft info:', err);
    res.status(200).send('Error: There was a problem fetching aircraft info.');
  }
}
