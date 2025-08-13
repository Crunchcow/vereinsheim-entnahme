// ---- Konfiguration ----
const CONFIG = {
  lookupEndpoint: "DEINE_LOOKUP_FLOW_URL?key=DEIN_LOOKUP_SECRET", // <- morgen einsetzen
  endpoint: "", // POST-Flow-URL (kommt später in Schritt 2)
  secretHeaderName: "x-pp-secret",
  secretHeaderValue: "",
  allowedUnits: ["Flasche", "Kiste"]
};

// ---- Fallback-Daten (für Testbetrieb ohne Flow) ----
const FALLBACK = {
  teams: ["1. Herren", "2. Herren"],
  articles: [
    "Bier", "Cola", "Wasser", "Fanta", "Spezi", "Radler",
    "Apfelschorle", "Energy", "Iso-Getränk", "Traubensaft", "Kirschsaft",
    "Orangensaft", "Wasser still", "Wasser medium", "Kaffee", "Tee"
  ]
};

// ---- UI-Elemente ----
const grid = document.getElementById("itemsGrid");
const teamSel = document.getElementById("team");
const msg = document.getElementById("msg");
let articles = [];
const state = {}; // z.B. {"Bier": {Flasche:0, Kiste:0}, ...}

// ---- Tiles aufbauen ----
function buildTiles() {
  grid.innerHTML = "";
  articles.forEach(a => {
    state[a] = { Flasche: 0, Kiste: 0 };
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.innerHTML = `
      <h3>${a}</h3>
      ${CONFIG.allowedUnits.map(u => `
        <div class="row">
          <span class="badge">${u}</span>
          <div class="counter">
            <button class="btn-ctr" data-article="${a}" data-unit="${u}" data-delta="-1">–</button>
            <span class="qty" id="qty-${a}-${u}">0</span>
            <button class="btn-ctr" data-article="${a}" data-unit="${u}" data-delta="1">+</button>
          </div>
        </div>
      `).join("")}
    `;
    grid.appendChild(tile);
  });

  grid.addEventListener("click", (e) => {
    const btn = e.target.closest("button.btn-ctr");
    if (!btn) return;
    const art = btn.dataset.article;
    const unit = btn.dataset.unit;
    const delta = parseInt(btn.dataset.delta, 10);
    const next = Math.max(0, (state[art][unit] || 0) + delta);
    state[art][unit] = next;
    document.getElementById(`qty-${art}-${unit}`).textContent = next;
  }, { passive: true });
}

// ---- Formular zurücksetzen ----
function resetForm() {
  Object.keys(state).forEach(a => CONFIG.allowedUnits.forEach(u => {
    state[a][u] = 0;
    const el = document.getElementById(`qty-${a}-${u}`);
    if (el) el.textContent = "0";
  }));
  teamSel.value = "";
  setMsg("");
}

// ---- Nachricht setzen ----
function setMsg(text, type) {
  msg.className = "msg" + (type ? " " + type : "");
  msg.textContent = text || "";
}

// ---- Payload sammeln ----
function collectPayload() {
  const team = teamSel.value.trim();
  const positions = [];
  Object.entries(state).forEach(([artikel, units]) => {
    CONFIG.allowedUnits.forEach(u => {
      const menge = units[u] || 0;
      if (menge > 0) positions.push({ artikel, einheit: u, menge });
    });
  });
  return { team, positions, quelle: "MiniWebApp", clientTime: new Date().toISOString() };
}

// ---- Daten an Flow senden ----
async function submitData() {
  const payload = collectPayload();
  if (!payload.team) return setMsg("Bitte ein Team wählen.", "err");
  if (payload.positions.length === 0) return setMsg("Bitte mindestens eine Menge über die ±-Buttons setzen.", "err");

  if (!CONFIG.endpoint) {
    console.log("DEMO: Würde senden:", payload);
    setMsg(`Demo: Erfasst ${payload.positions.length} Position(en). (Flow-Endpunkt noch nicht konfiguriert)`, "ok");
    return;
  }

  try {
    setMsg("Übermittle…");
    const res = await fetch(CONFIG.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [CONFIG.secretHeaderName]: CONFIG.secretHeaderValue
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.message || `HTTP ${res.status}`);
    setMsg(`Danke! Vorgangscode: ${data.submissionId || "–"} / Positionen: ${data.positionsWritten ?? payload.positions.length}`, "ok");
    resetForm();
  } catch (err) {
    console.error(err);
    setMsg("Fehler bei der Übermittlung. Bitte später erneut versuchen.", "err");
  }
}

// ---- Lookup-Daten laden ----
async function fetchLookups() {
  try {
    if (!CONFIG.lookupEndpoint) throw new Error("Lookup-URL nicht konfiguriert");
    const res = await fetch(CONFIG.lookupEndpoint);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.teams || !data.articles) throw new Error("Ungültiges Lookup-Format");

    teamSel.innerHTML = `<option value="">– bitte Team wählen –</option>` +
      data.teams.map(t => `<option>${t}</option>`).join("");
    articles = data.articles.slice();
    buildTiles();
  } catch (err) {
    console.error("Lookup-Fehler:", err);
    // Fallback nutzen, damit die Seite testbar bleibt
    teamSel.innerHTML = `<option value="">– bitte Team wählen –</option>` +
      FALLBACK.teams.map(t => `<option>${t}</option>`).join("");
    articles = FALLBACK.articles.slice();
    buildTiles();
    setMsg("Hinweis: Live-Daten nicht erreichbar, Fallback aktiv.", "err");
  }
}

// ---- Event-Handler ----
document.getElementById("submitBtn").addEventListener("click", submitData);
document.getElementById("resetBtn").addEventListener("click", resetForm);

// ---- Init ----
fetchLookups();
