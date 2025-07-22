from fastapi import FastAPI, HTTPException
import sqlite3

app = FastAPI()

DB = "aircraft_chat.db"

def get_aircraft_info(n_number):
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute('SELECT * FROM aircraft WHERE n_number = ?', (n_number.upper(),))
    ac = cur.fetchone()
    if not ac:
        conn.close()
        return None

    # Decode manufacturer/model
    cur.execute('SELECT mfr, model FROM acftref WHERE code = ?', (ac['mfr_mdl_code'],))
    acftref = cur.fetchone()
    acft_str = f"{acftref['mfr']} {acftref['model']}" if acftref else ac['mfr_mdl_code']

    # Decode engine info
    cur.execute('SELECT mfr, model, horsepower FROM engine WHERE code = ?', (ac['eng_mfr_mdl'],))
    engref = cur.fetchone()
    if engref:
        eng_str = f"{engref['mfr']} {engref['model']} ({engref['horsepower']}hp)"
    else:
        eng_str = ac['eng_mfr_mdl']

    result = (
        f"Reg: {ac['n_number']} | {acft_str} | "
        f"{ac['engine_count']} x {eng_str} | "
        f"Mfr Yr: {ac['year_mfr']} | {ac['type_aircraft']} | "
        f"{ac['seat_count']} seat(s) | MTOW: {ac['weight']}lbs | "
        f"Cruise Speed: {ac['cruising_speed']}kts"
    )

    conn.close()
    return result

@app.get("/aircraft/{n_number}")
def aircraft(n_number: str):
    info = get_aircraft_info(n_number)
    if not info:
        raise HTTPException(status_code=404, detail="Aircraft not found")
    return {"result": info}