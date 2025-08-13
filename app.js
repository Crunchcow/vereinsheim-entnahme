// ---- Konfiguration (später anpassen) ----
const CONFIG = {
  // Lookup-Flow (GET) – komplette URL inkl. Secret am Ende:
  lookupEndpoint: "https://defaulteee05d909b754472b1cd58561389d4.d0.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/f783fa9e5318425c99947d805c4cd10f/triggers/manual/paths/invoke/?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=I5HNEZ3GG1im8YwjO6FP61EkuyekTrJ0_U-XYv3Cg7Q&key=vwX7-84jhs",
  
  // Submit-Flow (POST) – kommt später
  endpoint: "",
  secretHeaderName: "x-pp-secret",
  secretHeaderValue: "",
  
  allowedUnits: ["Flasche", "Kiste"]
};

// ---- Globale Variablen ----
let articles = []; // Wird dynamisch aus Lookup-Flow befüllt
const grid = document.getElementById("itemsGrid");
const teamSel = document.getElementById("team");
const msg = document.getElementById("msg");
const state = {}; // z.B. {"Bier": {Flasche:0, Kiste:0}, ...}

// ---- Lookup-Flow abrufen ----
async function fetchLookups() {
  try {
    setMsg("Lade Daten…");
    const res = await fetch(CONFIG.lookupEndpoint, { method: "GET" });
    const data = await res.json();
    if (!res.ok || data.ok === false) throw new Error(data.message || "Lookup fehlgeschlagen");

    // Teams ins Dropdown
    const teamOptions = (data.teams || []).map(t => t.Teamname).filter(Boolean);
    teamSel.innerHTML = `<option value="">– bitte Team wählen –</option>` +
      teamOptions.map(t => `<option>${t}</option>`).join("");

    // Artikel in Liste
    articles = (data.articles || []).map(a => a.Artikel).filter(Boolean);

    // Kacheln aufbauen
    buildTiles();
    setMsg("");
  } catch (err) {
    console.error(err);
    setMsg("Konnte Teams/Artikel nicht laden. Bitte später erneut versuchen.", "err");
  }
}

// ---- UI aufbauen ----
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

function resetForm() {
  Object.keys(state).forEach(a => CONFIG.allowedUnits.forEach(u => {
    state[a][u] = 0;
    const el = document.getElementById(`qty-${a}-${u}`);
    if (el) el.textContent = "0";
  }));
  teamSel.value = "";
  setMsg("");
}

function setMsg(text, type) {
  msg.className = "msg" + (type ? " " + type : "");
  msg.textContent = text || "";
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

// ---- Senden an Flow (kommt in Schritt 2) ----
async function submitData() {
  const payload = collectPayload();
  if (!payload.team) return setMsg("Bitte ein Team wählen.", "err");
  if (payload.positions.length === 0) return setMsg("Bitte mindestens eine Menge über die ±-Buttons setzen.", "err");

  if (!CONFIG.endpoint) {
    // Bis der Flow steht, zeigen wir nur eine Vorschau in der Konsole.
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

// ---- Event-Handler ----
document.getElementById("submitBtn").addEventListener("click", submitData);
document.getElementById("resetBtn").addEventListener("click", resetForm);

// ---- Init ----
fetchLookups();
