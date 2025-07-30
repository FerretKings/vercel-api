const sqlite3 = require('sqlite3').verbose();
const path = require('path');

module.exports = async (req, res) => {
  // Get reg (tail number) from query string
  const reg = (req.query.reg || '').toUpperCase().trim();
  if (!reg) {
    res.status(400).send('Please provide a registration number via ?reg=N12345');
    return;
  }

  // Path to db in project root
  const dbPath = path.join(process.cwd(), 'aircraft_chat.db');
  const db = new sqlite3.Database(dbPath);

  // Helper to close db and send output
  function sendResponse(msg) {
    db.close();
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(msg);
  }

  // Lookup aircraft
  db.get(
    `SELECT * FROM aircraft WHERE n_number = ? COLLATE NOCASE`,
    [reg],
    (err, acft) => {
      if (err || !acft) {
        sendResponse(`No aircraft found for reg: ${reg}`);
        return;
      }

      // Lookup decoded aircraft type/model
      db.get(
        `SELECT mfr, model FROM acftref WHERE code = ?`,
        [acft.mfr_mdl_code],
        (err2, acftref) => {
          // Lookup engine info
          db.get(
            `SELECT mfr, model, horsepower FROM engine WHERE code = ?`,
            [acft.eng_mfr_mdl],
            (err3, engref) => {
              // Now build the string:
              const acftName = acftref
                ? `${acftref.mfr} ${acftref.model}`
                : acft.mfr_mdl_code;
              const engDesc = engref
                ? `${acft.eng_count || 1} x ${engref.mfr} ${engref.model} (${engref.horsepower}hp)`
                : `${acft.eng_count || 1} x ${acft.eng_mfr_mdl}`;
              const year = acft.year_mfr || 'Unknown';
              const type = acft.aircraft_type || 'Unknown';
              const seats = acft.seat_count ? `${acft.seat_count} seat(s)` : '';
              const mtow = acft.weight ? `MTOW: ${acft.weight}lbs` : '';
              const cruise = acft.cruise_speed ? `Cruise Speed: ${acft.cruise_speed}kts` : '';

              const parts = [
                `Reg: ${reg}`,
                acftName,
                engDesc,
                `Mfr Yr: ${year}`,
                type,
                seats,
                mtow,
                cruise,
              ];
              // Filter empty, join with pipes
              sendResponse(parts.filter(Boolean).join(' | '));
            }
          );
        }
      );
    }
  );
};
