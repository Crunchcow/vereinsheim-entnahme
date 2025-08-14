// ---- Konfiguration ----
const CONFIG = {
  // Lookup-Flow (GET) – komplette URL inkl. &key=<LookupSecret>
  lookupEndpoint:
    "https://defaulteee05d909b754472b1cd58561389d4.d0.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/f783fa9e5318425c99947d805c4cd10f/triggers/manual/paths/invoke/?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=I5HNEZ3GG1im8YwjO6FP61EkuyekTrJ0_U-XYv3Cg7Q&key=vwX7-84jhs",

  // Submit-Flow (POST)
  endpoint: "https://defaulteee05d909b754472b1cd58561389d4.d0.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/3960e2006ecf4edd964af0e72a034dcc/triggers/manual/paths/invoke/?api-version=1",
  secretHeaderName: "x-pp-secret",
  secretHeaderValue: "Verein2025!Entnahme",

  allowedUnits: ["Flasche", "Kiste"]
};

// ---- Globale Variablen/DOM ----
let articles = []; // [{key, name}]
const grid   = document.getElementById("itemsGrid");
const teamSel= document.getElementById("team");
const msg    = document.getElementById("msg");

// Warenkorb-Status: Map<articleKey, { Flasche:number, Kiste:number, name:string }>
const state = new Map();

// ---- UI bauen ----
function buildTiles() {
  grid.innerHTML = "";
  state.clear();

  articles.forEach(a => {
  const key = a.key ?? a.Artikel ?? a.name ?? String(a);
  const label = a.name ?? a.Artikel ?? String(a);

  state[key] = { Flasche: 0, Kiste: 0 };
  const tile = document.createElement("div");
  tile.className = "tile";
  tile.innerHTML = `
  <h3>${label}</h3>
  ${CONFIG.allowedUnits.map(u => `
    <div class="row">
      <span class="badge">${u}</span>
      <div class="counter">
        <button type="button" class="btn-ctr" data-article="${key}" data-unit="${u}" data-delta="-1">–</button>
        <span class="qty" id="qty-${key}-${u}">0</span>
        <button type="button" class="btn-ctr" data-article="${key}" data-unit="${u}" data-delta="1">+</button>
      </div>
    </div>
  `).join("")}
`;
  grid.appendChild(tile);
});
  
  grid.addEventListener("click", (e) => {
  const btn = e.target.closest("button.btn-ctr");
  if (!btn) return;
  e.preventDefault(); // wichtig bei Formularen

  const key   = btn.dataset.article;
  const unit  = btn.dataset.unit;
  const delta = parseInt(btn.dataset.delta, 10);

  // defensive: falls state[key] / state.get(key) fehlt
  const entry = state[key] ?? state.get?.(key) ?? { Flasche: 0, Kiste: 0 };
  const next  = Math.max(0, (entry[unit] || 0) + delta);
  entry[unit] = next;

  // zurückschreiben (objekt ODER Map unterstützen)
  if (state.set) state.set(key, entry); else state[key] = entry;

  const qtyEl = document.getElementById(`qty-${key}-${unit}`);
  if (qtyEl) qtyEl.textContent = String(next);
}, /* { passive: true } weglassen */);

// ---- Helpers ----
function setMsg(text, type) {
  msg.className = "msg" + (type ? " " + type : "");
  msg.textContent = text || "";
}

function resetForm() {
  // Team
  teamSel.value = "";

  // Mengen zurücksetzen
  state.forEach((entry, key) => {
    CONFIG.allowedUnits.forEach(u => {
      entry[u] = 0;
      const el = document.getElementById(`qty-${key}-${u}`);
      if (el) el.textContent = "0";
    });
    state.set(key, entry);
  });
  setMsg("");
}

function collectPayload() {
  const team = (teamSel.value || "").trim();
  const positions = [];
  state.forEach((entry, key) => {
    CONFIG.allowedUnits.forEach(u => {
      const menge = entry[u] || 0;
      if (menge > 0) positions.push({ artikel: key, einheit: u, menge });
    });
  });
  return { team, positions, quelle: "MiniWebApp", clientTime: new Date().toISOString() };
}

// ---- Normalizer für Lookup-Response ----
function normalizeTeams(payload) {
  const arr = Array.isArray(payload) ? payload : (payload?.body ?? []);
  // Teams können {id,name} oder {Teamname,...} sein
  return arr.map(t => ({
    id:   t.id   ?? t.Teamname ?? t.name ?? "",
    name: t.name ?? t.Teamname ?? String(t.id ?? "")
  })).filter(t => t.id && t.name);
}

function normalizeArticles(payload) {
  const arr = Array.isArray(payload) ? payload : (payload?.body ?? []);
  // Artikel können {key,name} oder {Artikel: "..."} sein
  return arr.map(a => ({
    key:  a.key  ?? a.Artikel ?? a.name ?? "",
    name: a.name ?? a.Artikel ?? String(a.key ?? "")
  })).filter(a => a.key && a.name);
}

// ---- Lookups laden ----
async function fetchLookups() {
  try {
    setMsg("Lade Daten…");
    const res = await fetch(CONFIG.lookupEndpoint, { method: "GET" });
    const data = await res.json();

    if (!res.ok || data.ok === false) throw new Error(data.message || `HTTP ${res.status}`);

    const teamsNorm    = normalizeTeams(data.teams);
    const articlesNorm = normalizeArticles(data.articles);

    if (!teamsNorm.length || !articlesNorm.length) {
      throw new Error("Ungültiges Lookup-Format oder leere Daten");
    }

    // Team-Select aufbauen
    teamSel.innerHTML = `<option value="">– bitte Team wählen –</option>` +
      teamsNorm.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`).join("");

    // Artikel speichern & Kacheln rendern
    articles = articlesNorm; // [{key,name}]
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
  if (!payload.team)                 return setMsg("Bitte ein Team wählen.", "err");
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

// ---- kleine XSS-Safety beim Einfügen von Text ----
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ---- Events & Init ----
document.getElementById("submitBtn").addEventListener("click", submitData);
document.getElementById("resetBtn").addEventListener("click", resetForm);
fetchLookups();
