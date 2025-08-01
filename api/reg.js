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

  // Lookup decoded aircraft type/model from acftref
  let acftName = acft.mfr_mdl_code;
  let acftref = null;
  if (acft.mfr_mdl_code) {
    acftref = db.prepare(
      'SELECT mfr, model, no_eng, no_seats, speed FROM acftref WHERE code = ?'
    ).get(acft.mfr_mdl_code);
    if (acftref && acftref.mfr && acftref.model) {
      acftName = `${acftref.mfr.trim()} ${acftref.model.trim()}`;
    }
  }

  // Engine count (prefer acftref, fallback to 1)
  let engine_count = (acftref && acftref.no_eng && Number.isInteger(acftref.no_eng))
    ? acftref.no_eng
    : 1;

  // Engine info (lookup engine table if possible and only if acft.eng_mfr_mdl exists)
  let engDesc = '';
  if (acft.eng_mfr_mdl) {
    const engref = db.prepare(
      'SELECT mfr, model, horsepower FROM engine WHERE code = ?'
    ).get(acft.eng_mfr_mdl);
    if (engref && engref.mfr && engref.model) {
      const hp = engref.horsepower ? ` (${engref.horsepower}hp)` : '';
      engDesc = `${engine_count} x ${engref.mfr.trim()} ${engref.model.trim()}${hp}`;
    } else {
      engDesc = `${engine_count} x ${acft.eng_mfr_mdl}`;
    }
  }

  // Year manufactured (skip if missing/invalid)
  const year = (acft.year_mfr && !isNaN(acft.year_mfr)) ? `Mfr Yr: ${acft.year_mfr}` : '';

  // Aircraft type (skip if missing)
  const type = acft.type_aircraft ? acft.type_aircraft.trim() : '';

  // Seat count (prefer acftref if available, skip if missing/invalid)
  let seat_count = (acftref && acftref.no_seats && Number.isInteger(acftref.no_seats))
    ? acftref.no_seats
    : null;

  let seats = '';
  if (seat_count !== null && seat_count !== undefined && seat_count > 0) {
    seats = `${seat_count} seat${seat_count === 1 ? '' : 's'}`;
  }

  // Cruise speed (prefer acftref, skip if missing/invalid/zero)
  let cruise = '';
  if (acftref && acftref.speed && acftref.speed > 0) {
    cruise = `Cruise Speed: ${acftref.speed}kts`;
  }

  // Assemble output: only include non-empty fields, no extra pipes
  const parts = [
    `Reg: ${displayReg}`,
    acftName,
    engDesc,
    year,
    type,
    seats,
    cruise,
  ].filter(s => s && s.trim());

  db.close();

  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send(parts.join(' | '));
};
