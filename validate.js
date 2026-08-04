/*
 * Checks every puzzle in puzzles.json is well-formed.
 * Run:  node validate.js
 */
const fs = require("fs");
const path = require("path");

const PUZZLES = JSON.parse(
  fs.readFileSync(path.join(__dirname, "puzzles.json"), "utf8")
);

const problems = [];
const seenIds = new Set();
const seenDates = new Set();

for (const p of PUZZLES) {
  const tag = `puzzle #${p.id} (${p.date})`;

  if (seenIds.has(p.id)) problems.push(`${tag}: duplicate id`);
  seenIds.add(p.id);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) problems.push(`${tag}: date must be YYYY-MM-DD`);
  if (seenDates.has(p.date)) problems.push(`${tag}: duplicate date`);
  seenDates.add(p.date);

  if (!Array.isArray(p.answers) || p.answers.length !== 4) {
    problems.push(`${tag}: needs exactly 4 entries in "answers"`);
    continue;
  }

  const levels = p.answers.map((a) => a.level).sort();
  if (String(levels) !== "0,1,2,3") problems.push(`${tag}: levels are ${levels}, need 0,1,2,3`);

  const words = [];
  for (const a of p.answers) {
    if (!a.group || !String(a.group).trim()) problems.push(`${tag}: an answer is missing "group"`);
    if (!Array.isArray(a.members) || a.members.length !== 4) {
      problems.push(`${tag}: "${a.group}" needs exactly 4 members`);
      continue;
    }
    for (const w of a.members) {
      if (w !== w.toUpperCase()) problems.push(`${tag}: "${w}" should be upper case`);
      words.push(w);
    }
  }

  const dupes = words.filter((w, i) => words.indexOf(w) !== i);
  if (dupes.length) problems.push(`${tag}: word appears twice: ${[...new Set(dupes)].join(", ")}`);
}

if (problems.length) {
  console.error(`✗ ${problems.length} problem(s):\n`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

// Warn about anything that will overflow a tile rather than fail the run.
const long = [...new Set(
  PUZZLES.flatMap((p) => p.answers.flatMap((a) => a.members)).filter((w) => w.length > 12)
)];

const dates = PUZZLES.map((p) => p.date).sort();
console.log(`✓ ${PUZZLES.length} puzzles, all well-formed.`);
console.log(`  Dates ${dates[0]} → ${dates[dates.length - 1]}`);
if (long.length) console.log(`  ! long words may crowd their tile: ${long.join(", ")}`);
