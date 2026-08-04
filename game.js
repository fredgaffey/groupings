/* Groupings — game logic. No build step, no dependencies. */

const MAX_MISTAKES = 4;
const STORE_KEY = "groupings:v1";
const EMOJI = ["🟨", "🟩", "🟦", "🟪"];

/* ---------- persistence ---------- */

function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch {
    return {}; // private browsing, corrupted value — play on without saving
  }
}

function saveStore(store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* storage unavailable; progress just won't persist */
  }
}

function recordProgress() {
  const store = loadStore();
  store[state.puzzle.id] = {
    solved: state.solved.map((g) => g.level),
    mistakes: state.mistakes,
    history: state.history,
    done: isDone(),
    won: state.solved.length === 4
  };
  saveStore(store);
}

/* ---------- state ---------- */

let PUZZLES = []; // filled by loadPuzzles() at boot

const state = {
  puzzle: null,
  deck: [],       // words still in play, in display order
  selected: [],   // words currently picked, max 4
  solved: [],     // group objects, in the order they were solved
  mistakes: 0,
  history: [],    // one entry per submitted guess: the 4 words' levels
  locked: false,  // true while an animation is resolving
  cursor: 0,      // keyboard focus index into deck
  source: null    // where the archive came from, shown in the archive sheet
};

const $ = (id) => document.getElementById(id);

const el = {
  board: $("board"),
  toast: $("toast"),
  dots: $("dots"),
  label: $("puzzle-label"),
  controls: $("controls"),
  mistakesRow: $("mistakes-row"),
  shuffle: $("btn-shuffle"),
  deselect: $("btn-deselect"),
  submit: $("btn-submit"),
  endgame: $("endgame"),
  endgameTitle: $("endgame-title"),
  shareGrid: $("share-grid"),
  share: $("btn-share"),
  archiveList: $("archive-list"),
  archiveSummary: $("archive-summary")
};

/* ---------- helpers ---------- */

const groupOf = (word) =>
  state.puzzle.answers.find((g) => g.members.includes(word));

const isDone = () =>
  state.solved.length === 4 || state.mistakes >= MAX_MISTAKES;

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric", year: "numeric"
  });
}

let toastTimer;
function toast(msg, sticky = false) {
  clearTimeout(toastTimer);
  el.toast.textContent = msg;
  el.toast.classList.toggle("show", Boolean(msg));
  if (msg && !sticky) {
    toastTimer = setTimeout(() => el.toast.classList.remove("show"), 2600);
  }
}

/* ---------- setup ---------- */

function startPuzzle(puzzle, { restore = true } = {}) {
  const saved = restore ? loadStore()[puzzle.id] : null;

  state.puzzle = puzzle;
  state.selected = [];
  state.locked = false;
  state.cursor = 0;
  state.mistakes = saved ? saved.mistakes : 0;
  state.history = saved ? saved.history.slice() : [];
  state.solved = saved
    ? saved.solved.map((lvl) => puzzle.answers.find((g) => g.level === lvl))
    : [];

  const solvedWords = new Set(state.solved.flatMap((g) => g.members));
  const remaining = puzzle.answers
    .flatMap((g) => g.members)
    .filter((w) => !solvedWords.has(w));
  state.deck = shuffled(remaining);

  el.label.textContent = `Puzzle #${puzzle.id} · ${formatDate(puzzle.date)}`;
  el.endgame.hidden = true;
  toast("");

  // A finished puzzle reopens fully revealed rather than half-played.
  if (state.mistakes >= MAX_MISTAKES && state.solved.length < 4) {
    revealRest({ animate: false });
  }

  render();
  if (isDone()) showEndgame();
}

/* ---------- rendering ---------- */

function render() {
  el.board.replaceChildren();

  for (const group of state.solved) {
    el.board.append(bandFor(group));
  }

  for (let r = 0; r < state.deck.length / 4; r++) {
    const row = document.createElement("div");
    row.className = "row";
    for (let c = 0; c < 4; c++) {
      const i = r * 4 + c;
      if (i < state.deck.length) row.append(tileFor(state.deck[i], i));
    }
    el.board.append(row);
  }

  renderDots();
  renderControls();
  fitAll();
}

/*
 * Answers range from 2 characters to full phrases, so a fixed size (or a
 * length-bucketed one) either clips the long ones or wastes the short ones.
 * Measure instead: start at the ideal size and step down until the text fits
 * its tile in both axes.
 */
const FIT_MAX = 17;
const FIT_MIN = 7;

function fitText(tile) {
  const label = tile.firstElementChild;
  if (!label) return;

  const style = getComputedStyle(tile);
  const availH = tile.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const availW = tile.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  if (availH <= 0 || availW <= 0) return; // not laid out yet

  let size = FIT_MAX;
  label.style.fontSize = `${size}px`;
  while (
    size > FIT_MIN &&
    (label.scrollHeight > availH || label.scrollWidth > availW)
  ) {
    size -= 0.5;
    label.style.fontSize = `${size}px`;
  }
}

function fitAll() {
  // Wait for layout so clientHeight/scrollHeight are meaningful.
  requestAnimationFrame(() => {
    for (const tile of el.board.querySelectorAll(".tile")) fitText(tile);
  });
}

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(fitAll, 120);
});

function bandFor(group) {
  const band = document.createElement("div");
  band.className = `band l${group.level}`;

  const name = document.createElement("div");
  name.className = "band-name";
  name.textContent = group.group;

  const words = document.createElement("div");
  words.className = "band-words";
  words.textContent = group.members.join(", ");

  band.append(name, words);
  return band;
}

function tileFor(word, index) {
  const tile = document.createElement("button");
  tile.type = "button";
  tile.className = "tile";
  if (state.selected.includes(word)) tile.classList.add("on");

  // Text lives in a span so fitText can measure it against the tile's box.
  const label = document.createElement("span");
  label.className = "tile-text";
  label.textContent = word;
  tile.append(label);
  tile.dataset.word = word;
  tile.setAttribute("aria-pressed", String(state.selected.includes(word)));
  tile.tabIndex = index === state.cursor ? 0 : -1;
  tile.addEventListener("click", () => toggle(word));
  return tile;
}

function renderDots() {
  el.dots.replaceChildren();
  for (let i = 0; i < MAX_MISTAKES; i++) {
    const dot = document.createElement("span");
    dot.className = i < state.mistakes ? "dot spent" : "dot";
    el.dots.append(dot);
  }
  el.dots.setAttribute(
    "aria-label",
    `${MAX_MISTAKES - state.mistakes} of ${MAX_MISTAKES} mistakes remaining`
  );
}

function renderControls() {
  const done = isDone();
  el.controls.hidden = done;
  el.mistakesRow.hidden = done;
  el.submit.disabled = state.selected.length !== 4 || state.locked;
  el.deselect.disabled = state.selected.length === 0 || state.locked;
  el.shuffle.disabled = state.locked;
}

function tileEl(word) {
  return el.board.querySelector(`[data-word="${CSS.escape(word)}"]`);
}

/* ---------- interaction ---------- */

function toggle(word) {
  if (state.locked || isDone()) return;

  const i = state.selected.indexOf(word);
  if (i >= 0) {
    state.selected.splice(i, 1);
  } else {
    if (state.selected.length === 4) return;
    state.selected.push(word);
    const t = tileEl(word);
    t.classList.add("pop");
    t.addEventListener("animationend", () => t.classList.remove("pop"), { once: true });
  }

  const t = tileEl(word);
  t.classList.toggle("on", state.selected.includes(word));
  t.setAttribute("aria-pressed", String(state.selected.includes(word)));
  state.cursor = state.deck.indexOf(word);
  renderControls();
}

function submit() {
  if (state.selected.length !== 4 || state.locked) return;

  const picked = state.selected.slice();
  const levels = picked.map((w) => groupOf(w).level);
  state.history.push(levels);

  const first = groupOf(picked[0]);
  const correct = picked.every((w) => groupOf(w) === first);

  if (correct) {
    resolveCorrect(first, picked);
    return;
  }

  // "One away" when three of the four share a group.
  const counts = {};
  for (const lvl of levels) counts[lvl] = (counts[lvl] || 0) + 1;
  const near = Object.values(counts).includes(3);

  state.mistakes++;
  state.locked = true;

  const tiles = picked.map(tileEl);
  tiles.forEach((t) => t.classList.add("shake"));
  toast(near ? "One away…" : "Not quite.");
  renderDots();

  setTimeout(() => {
    tiles.forEach((t) => t.classList.remove("shake"));
    state.locked = false;

    if (state.mistakes >= MAX_MISTAKES) {
      state.selected = [];
      revealRest({ animate: true });
    } else {
      recordProgress();
      renderControls();
    }
  }, 420);
}

function resolveCorrect(group, picked) {
  state.locked = true;
  const tiles = picked.map(tileEl);
  tiles.forEach((t, i) => {
    setTimeout(() => {
      t.classList.add("hop");
      t.addEventListener("animationend", () => t.classList.remove("hop"), { once: true });
    }, i * 90);
  });

  setTimeout(() => {
    state.solved.push(group);
    state.solved.sort((a, b) => a.level - b.level);
    state.deck = state.deck.filter((w) => !group.members.includes(w));
    state.selected = [];
    state.cursor = 0;
    state.locked = false;
    recordProgress();
    render();

    if (state.solved.length === 4) showEndgame();
    else toast(["Nice.", "Good one.", "That's three.", ""][state.solved.length - 1]);
  }, 700);
}

/* Walk out the groups the player never got, easiest first. */
function revealRest({ animate }) {
  const left = state.puzzle.answers
    .filter((g) => !state.solved.includes(g))
    .sort((a, b) => a.level - b.level);

  if (!animate) {
    state.solved.push(...left);
    state.solved.sort((a, b) => a.level - b.level);
    state.deck = [];
    recordProgress();
    return;
  }

  state.locked = true;
  left.forEach((group, i) => {
    setTimeout(() => {
      state.solved.push(group);
      state.solved.sort((a, b) => a.level - b.level);
      state.deck = state.deck.filter((w) => !group.members.includes(w));
      render();
      if (i === left.length - 1) {
        state.locked = false;
        recordProgress();
        showEndgame();
      }
    }, i * 550);
  });
}

/* ---------- endgame ---------- */

function shareText() {
  const rows = state.history.map((levels) => levels.map((l) => EMOJI[l]).join(""));
  return `Groupings #${state.puzzle.id}\n${rows.join("\n")}`;
}

function showEndgame() {
  const won = state.solved.length === 4 && state.mistakes < MAX_MISTAKES;
  const perfect = won && state.mistakes === 0;

  el.endgameTitle.textContent = perfect
    ? "Flawless."
    : won
    ? "Solved it."
    : "Next time.";

  el.shareGrid.textContent = state.history
    .map((levels) => levels.map((l) => EMOJI[l]).join(""))
    .join("\n");

  el.endgame.hidden = false;
  el.controls.hidden = true;
  el.mistakesRow.hidden = true;
  toast("");
}

async function copyResults() {
  const text = shareText();
  try {
    await navigator.clipboard.writeText(text);
    el.share.textContent = "Copied";
  } catch {
    // clipboard blocked (non-https, or denied) — fall back to a selectable prompt
    window.prompt("Copy your results:", text);
    el.share.textContent = "Copy results";
    return;
  }
  setTimeout(() => (el.share.textContent = "Copy results"), 1800);
}

/* ---------- archive ---------- */

function renderArchive() {
  const store = loadStore();
  const list = PUZZLES.slice().sort((a, b) => b.date.localeCompare(a.date));

  const wins = list.filter((p) => store[p.id]?.won).length;

  let origin = "";
  if (state.source) {
    origin = ` Loaded from ${state.source.name}`;
    origin += state.source.fetchedAt
      ? `, updated ${new Date(state.source.fetchedAt).toLocaleString()}.`
      : ".";
  }
  el.archiveSummary.textContent =
    `${list.length} puzzles · ${wins} solved. Progress is saved in this browser.${origin}`;

  el.archiveList.replaceChildren();

  for (const puzzle of list) {
    const saved = store[puzzle.id];
    const li = document.createElement("li");

    const btn = document.createElement("button");
    btn.className = "archive-item";
    btn.type = "button";
    if (state.puzzle && puzzle.id === state.puzzle.id) {
      btn.setAttribute("aria-current", "true");
    }

    const no = document.createElement("span");
    no.className = "archive-no";
    no.textContent = `#${puzzle.id}`;

    const date = document.createElement("span");
    date.className = "archive-date";
    date.textContent = formatDate(puzzle.date);

    const status = document.createElement("span");
    if (saved?.won) {
      status.className = "archive-state won";
      status.textContent = saved.mistakes === 0 ? "Flawless" : `${saved.mistakes} off`;
    } else if (saved?.done) {
      status.className = "archive-state lost";
      status.textContent = "Missed";
    } else if (saved?.solved?.length) {
      status.className = "archive-state part";
      status.textContent = `${saved.solved.length}/4`;
    } else {
      status.className = "archive-state part";
      status.textContent = "New";
    }

    btn.append(no, date, status);
    btn.addEventListener("click", () => {
      closeSheets();
      startPuzzle(puzzle);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    li.append(btn);
    el.archiveList.append(li);
  }
}

/* ---------- sheets ---------- */

function openSheet(id) {
  if (id === "sheet-archive") renderArchive();
  $(id).hidden = false;
  $(id).querySelector("[data-close]").focus();
}

function closeSheets() {
  for (const s of document.querySelectorAll(".sheet")) s.hidden = true;
}

/* ---------- keyboard ---------- */

function onKeydown(e) {
  if (!$("sheet-archive").hidden || !$("sheet-help").hidden) {
    if (e.key === "Escape") closeSheets();
    return;
  }
  if (isDone() || state.locked) return;

  const n = state.deck.length;
  if (!n) return;

  const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 4, ArrowUp: -4 };
  if (e.key in moves) {
    e.preventDefault();
    state.cursor = (state.cursor + moves[e.key] + n) % n;
    tileEl(state.deck[state.cursor])?.focus();
  } else if (e.key === "Enter") {
    e.preventDefault();
    submit();
  } else if (e.key === "Escape") {
    state.selected = [];
    render();
  }
}

/* ---------- wiring ---------- */

el.submit.addEventListener("click", submit);

el.deselect.addEventListener("click", () => {
  state.selected = [];
  render();
});

el.shuffle.addEventListener("click", () => {
  state.deck = shuffled(state.deck);
  state.cursor = 0;
  render();
});

el.share.addEventListener("click", copyResults);
$("btn-archive").addEventListener("click", () => openSheet("sheet-archive"));
$("btn-archive-2").addEventListener("click", () => openSheet("sheet-archive"));
$("btn-help").addEventListener("click", () => openSheet("sheet-help"));

for (const target of document.querySelectorAll("[data-close]")) {
  target.addEventListener("click", closeSheets);
}

document.addEventListener("keydown", onKeydown);

/* ---------- boot ---------- */

/*
 * puzzles.json is the source of truth, but fetch() is blocked on file:// URLs,
 * so fall back to the copy bundle.js embeds in puzzles.js. Both hold the same
 * data; regenerate with `node bundle.js` after editing the JSON.
 */
/*
 * The archive ships with the site — no third-party call at runtime. It is kept
 * current by the scheduled rebuild in .github/workflows/update-archive.yml,
 * which pulls upstream, validates, and redeploys.
 *
 * puzzles.json is the source of truth; PUZZLES_EMBEDDED is the mirror that
 * bundle.js writes, for when index.html is opened over file:// and fetch()
 * is unavailable.
 */
async function loadPuzzles() {
  try {
    const res = await fetch("puzzles.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) throw new Error("empty or not an array");
    state.source = { name: "puzzles.json", fetchedAt: null };
    return normalize(data);
  } catch {
    state.source = { name: "bundled copy", fetchedAt: null };
    return normalize(typeof PUZZLES_EMBEDDED !== "undefined" ? PUZZLES_EMBEDDED : []);
  }
}

/*
 * Real-world archive dumps are ragged, so repair what's repairable and drop
 * what isn't rather than letting one bad record break the board.
 *
 * The important case: some dumps lose the difficulty ranking and write
 * level: -1 across all four groups. Array order still carries the ranking
 * (easiest first), so fall back to index. Verified against this archive —
 * every puzzle that *did* have real levels was already in 0,1,2,3 order.
 */
function normalize(raw) {
  const out = [];

  for (const p of raw) {
    if (!p || !Array.isArray(p.answers) || p.answers.length !== 4) continue;

    const answers = p.answers.map((a, i) => ({
      // -1 (or any non-0..3 value) means the dump lost the ranking; use position.
      level: Number.isInteger(a.level) && a.level >= 0 && a.level <= 3 ? a.level : i,
      group: String(a.group ?? "").trim(),
      members: (a.members || []).map((m) => String(m).trim().toUpperCase())
    }));

    // Every group needs 4 non-empty words, a name, and one of each level.
    const wellFormed =
      answers.every((a) => a.group && a.members.length === 4 && a.members.every(Boolean)) &&
      String(answers.map((a) => a.level).sort()) === "0,1,2,3";
    if (!wellFormed) continue;

    // A repeated word makes the puzzle ambiguous — it can't be solved as intended.
    const words = answers.flatMap((a) => a.members);
    if (new Set(words).size !== 16) continue;

    out.push({ id: p.id, date: p.date, answers });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// Open on today's puzzle if there is one, else the most recent past one.
(async function boot() {
  PUZZLES = await loadPuzzles();

  if (!PUZZLES.length) {
    el.label.textContent = "No puzzles found — check puzzles.json";
    el.controls.hidden = true;
    el.mistakesRow.hidden = true;
    return;
  }

  const today = new Date();
  const iso = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0")
  ].join("-");

  const sorted = PUZZLES.slice().sort((a, b) => a.date.localeCompare(b.date));
  const dueToday = sorted.find((p) => p.date === iso);
  const past = sorted.filter((p) => p.date <= iso);

  startPuzzle(dueToday || past[past.length - 1] || sorted[0]);
})();
