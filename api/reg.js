const Database = require('better-sqlite3');
const path = require('path');

module.exports = (req, res) => {
  let inputReg = (req.query.reg || '').toUpperCase().trim();
  if (!inputReg) {
    res.status(400).send('Please provide a registration number via ?reg=N2150G');
    return;
  }

  // Remove leading N for DB lookup, always display with N
  const dbReg = inputReg.startsWith('N') ? inputReg.substring(1) : inputReg;
  const displayReg = inputReg.startsWith('N') ? inputReg : `N${inputReg}`;

  const dbPath = path.join(process.cwd(), 'aircraft_chat.db');
  let db;
  try {
    db = new Database(dbPath, { readonly: true });
  } catch (e) {
    res.status(500).send('Could not open database.');
    return;
  }

  // Lookup aircraft record (DB stores registration WITHOUT leading N)
  const acft = db.prepare(
    'SELECT * FROM aircraft WHERE n_number = ? COLLATE NOCASE'
  ).get(dbReg);

  if (!acft) {
    db.close();
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(`No aircraft found for reg: ${displayReg}`);
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
  let engDesc = '';
  let engref = null;
  if (acft.eng_mfr_mdl) {
    engref = db.prepare(
      'SELECT mfr, model, horsepower FROM engine WHERE code = ?'
    ).get(acft.eng_mfr_mdl);
  }
  if (engref) {
    const hp = engref.horsepower ? ` (${engref.horsepower}hp)` : '';
    engDesc = `${acft.eng_count || 1} x ${engref.mfr} ${engref.model}${hp}`;
  } else if (acft.eng_mfr_mdl) {
    engDesc = `${acft.eng_count || 1} x ${acft.eng_mfr_mdl}`;
  }

  // Grab seat count, MTOW, etc. directly from the aircraft table
  const year = acft.year_mfr ? `Mfr Yr: ${acft.year_mfr}` : '';
  const type = acft.aircraft_type || '';
  const seats = (acft.seat_count !== undefined && acft.seat_count !== null) ? `${acft.seat_count} seat(s)` : '';
  const mtow = (acft.weight !== undefined && acft.weight !== null) ? `MTOW: ${acft.weight}lbs` : '';
  const cruise = (acft.cruise_speed !== undefined && acft.cruise_speed !== null) ? `Cruise Speed: ${acft.cruise_speed}kts` : '';

  // Assemble the output as vertical pipe-separated string
  const parts = [
    `Reg: ${displayReg}`,
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
