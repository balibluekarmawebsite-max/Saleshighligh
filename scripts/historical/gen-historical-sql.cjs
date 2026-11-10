/* Parse the manual "Daily Reservation Report" workbooks (PU occupancy grids,
 * 2025-2026) into daily_pickup_snapshots rows and emit idempotent SQL.
 * Saleable = roomCount x days-in-stay-month (OOO treated as 0 — verified against
 * the manual room-sold figures). Revenue is left NULL (occupancy history only).
 * Usage: node gen-historical-sql.cjs OUT.sql CODE=room=/path ... */
const XLSX = require("xlsx");
const fs = require("fs");

const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
const monthFrom = (s) => {
  const m = String(s || "").toLowerCase().match(/\b(january|february|march|april|may|june|july|august|september|sept|sep|oct|october|nov|november|dec|december|jan|feb|mar|apr|jun|jul|aug)\b/);
  if (!m) return null;
  const k = m[1].slice(0, 3);
  return MONTHS[k] ?? null;
};
const yearFrom = (name) => {
  const m = name.replace(/[oO]/g, "0").match(/20(2\d)/);
  return m ? Number(m[0]) : null;
};
const norm = (s) => String(s == null ? "" : s).trim().toLowerCase();
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const isPuSheet = (name) => /\bpu\b/i.test(name) && !/rev|yield|forecast|market|\bbep\b|sheet/i.test(name);

function parsePuSheet(ws, snapYear, snapMonth, roomCount) {
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: true, defval: null });
  // Find the header row: col0 == "date", remaining cols are month labels.
  let hdr = -1;
  for (let i = 0; i < aoa.length; i++) {
    if (norm(aoa[i] && aoa[i][0]) === "date") { hdr = i; break; }
  }
  if (hdr < 0) return [];
  // Stay-month columns: consecutive month-labelled cells after col 0.
  const cols = [];
  const row = aoa[hdr];
  for (let c = 1; c < row.length; c++) {
    const mm = monthFrom(row[c]);
    if (mm == null) break; // stop at "New Reservation Entered" etc.
    cols.push({ c, stayMonth: mm });
  }
  if (cols.length === 0) return [];
  // Assign stay-years by walking CONSECUTIVE months (the window can be 12 or 13
  // months, e.g. Feb 2026 shows Jan 2026 .. Jan 2027). The first column's year
  // is the sheet's snapshot year; the year increments whenever the month wraps
  // (this month <= previous month). Modular offsets would collapse a 13th column
  // onto the first and create a duplicate key.
  let yr = snapYear;
  cols[0].stayYear = yr;
  for (let k = 1; k < cols.length; k++) {
    if (cols[k].stayMonth <= cols[k - 1].stayMonth) yr += 1;
    cols[k].stayYear = yr;
  }
  // Latest-reading net revenue on hand per stay month: the first "revenue nett"
  // row (present in every sheet; equals "current rev on hand" in 2026 sheets),
  // aligned to the same stay-month columns. ADR is derived (revenue / room
  // nights), so we only store revenue — on the latest snapshot day's rows.
  let revRowIdx = -1;
  for (let i = hdr + 1; i < aoa.length; i++) {
    if (norm(aoa[i] && aoa[i][0]) === "revenue nett") { revRowIdx = i; break; }
  }
  const revByCol = new Map();
  if (revRowIdx >= 0) {
    const rr = aoa[revRowIdx];
    for (const col of cols) {
      const rv = rr[col.c];
      if (typeof rv === "number" && Number.isFinite(rv) && rv > 0) revByCol.set(col.c, Math.round(rv));
    }
  }
  const snapDays = daysInMonth(snapYear, snapMonth);
  const out = [];
  let maxDay = 0;
  for (let i = hdr + 1; i < aoa.length; i++) {
    const r = aoa[i];
    const day = r && typeof r[0] === "number" ? Math.trunc(r[0]) : null;
    if (day == null || day < 1 || day > 31) break; // footer / blank → stop
    if (day > snapDays) continue;
    if (day > maxDay) maxDay = day;
    const sdate = `${snapYear}-${String(snapMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    for (const col of cols) {
      let v = r[col.c];
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      if (v > 1.5) v = v / 100; // stray percentage → fraction
      if (v < 0) continue;
      const saleable = roomCount * daysInMonth(col.stayYear, col.stayMonth);
      const roomNights = Math.round(v * saleable);
      out.push({ sdate, day, colC: col.c, stayYear: col.stayYear, stayMonth: col.stayMonth, roomNights, saleable, revenue: null });
    }
  }
  // Attach revenue to the latest snapshot day's rows (the current on-hand value).
  for (const r of out) {
    if (r.day === maxDay && revByCol.has(r.colC)) r.revenue = revByCol.get(r.colC);
    delete r.day;
    delete r.colC;
  }
  return out;
}

function parseWorkbook(file, code, roomCount) {
  const wb = XLSX.readFile(file, { cellDates: false });
  const rows = [];
  const sheetsParsed = [];
  for (const name of wb.SheetNames) {
    if (!isPuSheet(name)) continue;
    const y = yearFrom(name);
    const m = monthFrom(name);
    if (!y || !m) { sheetsParsed.push(`SKIP(no ym): ${name}`); continue; }
    const got = parsePuSheet(wb.Sheets[name], y, m, roomCount);
    sheetsParsed.push(`${name} -> ${y}-${String(m).padStart(2,"0")} : ${got.length} rows`);
    rows.push(...got);
  }
  return { rows, sheetsParsed };
}

// ---- main ----
const [outPath, ...specs] = process.argv.slice(2);
const parsed = {};
for (const spec of specs) {
  const [code, room, path] = spec.split("=");
  parsed[code] = parseWorkbook(path, code, Number(room));
  // Dedupe by (sdate, stayYear, stayMonth) — last wins — so the upsert can never
  // hit the same conflict key twice in one statement.
  const seen = new Map();
  for (const r of parsed[code].rows) seen.set(`${r.sdate}|${r.stayYear}|${r.stayMonth}`, r);
  const dups = parsed[code].rows.length - seen.size;
  parsed[code].rows = [...seen.values()];
  console.log(`\n### ${code} (roomCount ${room})  [deduped ${dups}]`);
  for (const line of parsed[code].sheetsParsed) console.log("  " + line);
  const rows = parsed[code].rows;
  const dates = [...new Set(rows.map((r) => r.sdate))].sort();
  console.log(`  TOTAL rows: ${rows.length}, snapshot dates: ${dates.length}, range: ${dates[0]} .. ${dates[dates.length-1]}`);
  // spot check
  const nov9 = rows.find((r) => r.sdate.endsWith("-11-09") && r.sdate.startsWith("2026") && r.stayMonth === 11 && r.stayYear === 2026);
  if (nov9) console.log(`  spot-check 2026-11-09 Nov: roomNights=${nov9.roomNights} saleable=${nov9.saleable}`);
}

// ---- emit SQL ----
const esc = (s) => String(s).replace(/'/g, "''");
let sql = "";
sql += "-- Historical daily occupancy backfill (Jan 2025 .. Nov 2026) from the manual\n";
sql += "-- \"Daily Reservation Report\" workbooks. Occupancy only (roomNights + saleable);\n";
sql += "-- saleable = roomCount x days-in-month. Idempotent: replaces the covered date\n";
sql += "-- range per property, then inserts. Safe to re-run.\n";
sql += "BEGIN;\n\n";
let grand = 0;
for (const code of Object.keys(parsed)) {
  const rows = parsed[code].rows;
  if (rows.length === 0) continue;
  const dates = [...new Set(rows.map((r) => r.sdate))].sort();
  const minD = dates[0], maxD = dates[dates.length - 1];
  sql += `-- ${code}: ${rows.length} rows, ${minD} .. ${maxD}\n`;
  sql += `DELETE FROM daily_pickup_snapshots WHERE "propertyId" = (SELECT id FROM properties WHERE code = '${code}')\n`;
  sql += `  AND "snapshotDate" >= '${minD}' AND "snapshotDate" <= '${maxD}';\n`;
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    sql += `INSERT INTO daily_pickup_snapshots ("id","propertyId","snapshotDate","stayYear","stayMonth","roomNights","saleableRooms","revenue","createdAt","updatedAt")\n`;
    sql += `SELECT v.id, p.id, v.sdate::date, v.sy, v.sm, v.rn, v.sale, v.rev::numeric, now(), now()\n`;
    sql += `FROM properties p CROSS JOIN (VALUES\n`;
    sql += chunk.map((r) => {
      const id = `hist-${code}-${r.sdate}-${r.stayYear}-${String(r.stayMonth).padStart(2,"0")}`;
      const rev = r.revenue == null ? "NULL" : r.revenue;
      return `  ('${esc(id)}','${r.sdate}',${r.stayYear},${r.stayMonth},${r.roomNights},${r.saleable},${rev})`;
    }).join(",\n");
    sql += `\n) AS v(id, sdate, sy, sm, rn, sale, rev)\nWHERE p.code = '${code}'\n`;
    sql += `ON CONFLICT ("propertyId","snapshotDate","stayYear","stayMonth")\n`;
    sql += `DO UPDATE SET "roomNights" = EXCLUDED."roomNights", "saleableRooms" = EXCLUDED."saleableRooms", "revenue" = EXCLUDED."revenue", "updatedAt" = now();\n`;
  }
  sql += "\n";
  grand += rows.length;
}
sql += "COMMIT;\n";
fs.writeFileSync(outPath, sql);
console.log(`\nWROTE ${outPath} — ${grand} rows total, ${(sql.length/1024/1024).toFixed(2)} MB`);
