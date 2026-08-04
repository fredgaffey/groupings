/*
 * Reports on puzzles.json, mirroring the normalizer in game.js.
 *
 * Two severities, because real archive dumps are ragged:
 *   REPAIRED — game.js fixes it at load (missing levels, casing, whitespace)
 *   DROPPED  — unusable, game.js skips the puzzle entirely
 *
 * Exits non-zero only if nothing usable survives.
 *
 * Run:  node validate.js
 */
const fs = require("fs");
const path = require("path");

const PUZZLES = JSON.parse(
  fs.readFileSync(path.join(__dirname, "puzzles.json"), "utf8")
);

const repaired = [];
const dropped = [];
let kept = 0;

for (const p of PUZZLES) {
  const tag = `#${p?.id} (${p?.date})`;

  if (!p || !Array.isArray(p.answers) || p.answers.length !== 4) {
    dropped.push(`${tag}: not 4 groups`);
    continue;
  }

  const levelsMissing = p.answers.some(
    (a) => !Number.isInteger(a.level) || a.level < 0 || a.level > 3
  );

  const answers = p.answers.map((a, i) => ({
    level: Number.isInteger(a.level) && a.level >= 0 && a.level <= 3 ? a.level : i,
    group: String(a.group ?? "").trim(),
    members: (a.members || []).map((m) => String(m).trim().toUpperCase())
  }));

  const badGroup = answers.find(
    (a) => !a.group || a.members.length !== 4 || !a.members.every(Boolean)
  );
  if (badGroup) {
    dropped.push(`${tag}: group "${badGroup.group || "(unnamed)"}" is missing words`);
    continue;
  }

  if (String(answers.map((a) => a.level).sort()) !== "0,1,2,3") {
    dropped.push(`${tag}: levels don't resolve to 0,1,2,3`);
    continue;
  }

  const words = answers.flatMap((a) => a.members);
  if (new Set(words).size !== 16) {
    const dupes = [...new Set(words.filter((w, i) => words.indexOf(w) !== i))];
    dropped.push(`${tag}: repeated word (${dupes.join(", ")}) — puzzle is ambiguous`);
    continue;
  }

  if (levelsMissing) repaired.push(`${tag}: levels derived from group order`);
  kept++;
}

const ids = PUZZLES.map((p) => p?.id);
const dates = PUZZLES.map((p) => p?.date).filter(Boolean).sort();
const dupeIds = ids.length - new Set(ids).size;
const dupeDates = dates.length - new Set(dates).size;

console.log(`${kept} of ${PUZZLES.length} puzzles playable.`);
if (dates.length) console.log(`  Dates ${dates[0]} → ${dates[dates.length - 1]}`);
if (dupeIds) console.log(`  ! ${dupeIds} duplicate id(s) — archive progress keys off id`);
if (dupeDates) console.log(`  ! ${dupeDates} duplicate date(s)`);

if (repaired.length) {
  console.log(`\nREPAIRED at load (${repaired.length}):`);
  for (const r of repaired.slice(0, 5)) console.log(`  ${r}`);
  if (repaired.length > 5) console.log(`  … and ${repaired.length - 5} more`);
}

if (dropped.length) {
  console.log(`\nDROPPED (${dropped.length}):`);
  for (const d of dropped) console.log(`  ${d}`);
}

const long = [...new Set(
  PUZZLES.flatMap((p) => (p?.answers || []).flatMap((a) => a.members || []))
    .filter((w) => typeof w === "string" && w.length > 12)
)];
if (long.length) {
  console.log(`\n! ${long.length} word(s) over 12 chars may crowd their tile:`);
  console.log(`  ${long.slice(0, 12).join(", ")}${long.length > 12 ? " …" : ""}`);
}

if (!kept) {
  console.error("\n✗ nothing playable in puzzles.json");
  process.exit(1);
}
