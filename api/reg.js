const Database = require('better-sqlite3');
const path = require('path');

module.exports = (req, res) => {
  const reg = (req.query.reg || '').toUpperCase().trim();
  if (!reg) {
    res.status(400).send('Please provide a registration number via ?reg=N12345');
    return;
  }

  const dbPath = path.join(process.cwd(), 'aircraft_chat.db');
  let db;
  try {
    db = new Database(dbPath, { readonly: true });
  } catch (e) {
    res.status(500).send('Could not open database.');
    return;
  }

  // Lookup aircraft record
  const acft = db.prepare(
    'SELECT * FROM aircraft WHERE n_number = ? COLLATE NOCASE'
  ).get(reg);

  if (!acft) {
    db.close();
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(`No aircraft found for reg: ${reg}`);
    return;
  }

  // Lookup decoded aircraft type/model
  let acftName = acft.mfr_mdl_code;
  const acftref = db.prepare(
    'SELECT mfr, model FROM acftref WHERE code = ?'
  ).get(acft.mfr_mdl_code);
  if (acftref) {
    acftName = `${acftref.mfr} ${acftref.model}`;
  }

  // Lookup engine info and decode
  let engDesc = `${acft.eng_count || 1} x ${acft.eng_mfr_mdl}`;
  let hp = '';
  const engref = db.prepare(
    'SELECT mfr, model, horsepower FROM engine WHERE code = ?'
  ).get(acft.eng_mfr_mdl);
  if (engref) {
    hp = engref.horsepower ? ` (${engref.horsepower}hp)` : '';
    engDesc = `${acft.eng_count || 1} x ${engref.mfr} ${engref.model}${hp}`;
  }

  // Build the string values
  const year = acft.year_mfr ? `Mfr Yr: ${acft.year_mfr}` : '';
  const type = acft.aircraft_type || '';
  const seats = acft.seat_count ? `${acft.seat_count} seat(s)` : '';
  const mtow = acft.weight ? `MTOW: ${acft.weight}lbs` : '';
  const cruise = acft.cruise_speed ? `Cruise Speed: ${acft.cruise_speed}kts` : '';

  // Assemble the output as vertical pipe-separated string
  const parts = [
    `Reg: ${reg}`,
    acftName,
    engDesc,
    year,
    type,
    seats,
    mtow,
    cruise,
  ].filter(Boolean);

  db.close();

  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send(parts.join(' | '));
};
