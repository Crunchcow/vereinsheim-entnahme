// ---- Konfiguration ----
const CONFIG = {
  // Lookup-Flow (GET) – komplette URL inkl. &key=<LookupSecret>
  lookupEndpoint: "https://defaulteee05d909b754472b1cd58561389d4.d0.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/f783fa9e5318425c99947d805c4cd10f/triggers/manual/paths/invoke/?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=I5HNEZ3GG1im8YwjO6FP61EkuyekTrJ0_U-XYv3Cg7Q&key=vwX7-84jhs",

  // Submit-Flow (POST)
  endpoint: "YOUR_POST_URL",
  secretHeaderName: "x-pp-secret",
  secretHeaderValue: "YOUR_SUBMIT_SECRET",

  allowedUnits: ["Flasche", "Kiste"]
};

// ---- Globale Variablen/DOM ----
let articles = []; // dynamisch aus Lookup
const grid = document.getElementById("itemsGrid");
const teamSel = document.getElementById("team");
const msg = document.getElementById("msg");
const state = {}; // z.B. {"Bier": {Flasche:0, Kiste:0}}

// ---- UI bauen ----
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

// ---- Helpers ----
function setMsg(text, type) {
  msg.className = "msg" + (type ? " " + type : "");
  msg.textContent = text || "";
}

function resetForm() {
  Object.keys(state).forEach(a => CONFIG.allowedUnits.forEach(u => {
    state[a][u] = 0;
    const el = document.getElementById(`qty-${a}-${u}`);
    if (el) el.textContent = "0";
  }));
  teamSel.value = "";
  setMsg("");
}

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

// ---- Lookups laden ----
async function fetchLookups() {
  try {
    setMsg("Lade Daten…");
    const res = await fetch(CONFIG.lookupEndpoint, { method: "GET" });
    const data = await res.json();
    if (!res.ok || data.ok === false) throw new Error(data.message || `HTTP ${res.status}`);

    // Erwartetes Format: { ok:true, teams:[ "1. Herren", ... ], articles:[ "Bier", ... ] }
    if (!Array.isArray(data.teams) || !Array.isArray(data.articles)) throw new Error("Ungültiges Lookup-Format");

    teamSel.innerHTML = `<option value="">– bitte Team wählen –</option>` +
      data.teams.map(t => `<option>${t}</option>`).join("");

    articles = data.articles.slice();
    buildTiles();
    setMsg("");
  } catch (err) {
    console.error("Lookup-Fehler:", err);
    setMsg("Konnte Teams/Artikel nicht laden. Bitte später erneut versuchen.", "err");
  }
}

// ---- Absenden ----
async function submitData() {
  const payload = collectPayload();
  if (!payload.team) return setMsg("Bitte ein Team wählen.", "err");
  if (payload.positions.length === 0) return setMsg("Bitte mindestens eine Menge über die ±‑Buttons setzen.", "err");

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

    setMsg(`Danke! Vorgangscode: ${data.submissionId || "–"} · Positionen: ${data.positionsWritten ?? payload.positions.length}`, "ok");
    resetForm();
  } catch (err) {
    console.error(err);
    setMsg("Fehler bei der Übermittlung. Bitte später erneut versuchen.", "err");
  }
}

// ---- Events & Init ----
document.getElementById("submitBtn").addEventListener("click", submitData);
document.getElementById("resetBtn").addEventListener("click", resetForm);
fetchLookups();
