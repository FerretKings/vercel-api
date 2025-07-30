const Database = require('better-sqlite3');
const path = require('path');

module.exports = (req, res) => {
  let inputReg = (req.query.reg || '').toUpperCase().trim();
  if (!inputReg) {
    res.status(400).send('Please provide a registration number via ?reg=N2150G');
    return;
  }

  // Remove leading 'N' for DB query, always display with 'N'
  const dbReg = inputReg.startsWith('N') ? inputReg.slice(1) : inputReg;
  const displayReg = inputReg.startsWith('N') ? inputReg : `N${inputReg}`;

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

  // Engine info (lookup engine table if possible)
  let engDesc = '';
  let engref = null;
  if (acft.eng_mfr_mdl) {
    engref = db.prepare(
      'SELECT mfr, model, horsepower FROM engine WHERE code = ?'
    ).get(acft.eng_mfr_mdl);
  }
  if (engref) {
    const hp = engref.horsepower && engref.horsepower !== 'NULL' ? ` (${engref.horsepower}hp)` : '';
    engDesc = `${acft.engine_count || 1} x ${engref.mfr} ${engref.model}${hp}`;
  } else if (acft.eng_mfr_mdl) {
    engDesc = `${acft.engine_count || 1} x ${acft.eng_mfr_mdl}`;
  }

  // Year manufactured
  const year = acft.year_mfr ? `Mfr Yr: ${acft.year_mfr}` : '';
  // Aircraft type
  const type = acft.type_aircraft || '';
  // Seat count
  const seats = (acft.seat_count !== undefined && acft.seat_count !== null) ? `${acft.seat_count} seat(s)` : '';
  // MTOW (weight)
  const mtow = (acft.weight !== undefined && acft.weight !== null) ? `MTOW: ${acft.weight} lbs` : '';
  // Cruising speed
  const cruise = (acft.cruising_speed !== undefined && acft.cruising_speed !== null) ? `Cruise Speed: ${acft.cruising_speed}kts` : '';

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
