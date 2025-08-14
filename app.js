// ============================
// Vereinsheim – Kühlschrank-Entnahme (WebApp)
// ============================

// ---- Konfiguration ----
const CONFIG = {
  // Lookup-Flow (GET) – komplette URL inkl. &key=<LookupSecret>
  lookupEndpoint:
    "https://defaulteee05d909b754472b1cd58561389d4.d0.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/f783fa9e5318425c99947d805c4cd10f/triggers/manual/paths/invoke/?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=I5HNEZ3GG1im8YwjO6FP61EkuyekTrJ0_U-XYv3Cg7Q&key=vwX7-84jhs",

  // Submit-Flow (POST)
  endpoint:
    "https://defaulteee05d909b754472b1cd58561389d4.d0.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/3960e2006ecf4edd964af0e72a034dcc/triggers/manual/paths/invoke/?api-version=1",

  secretHeaderName: "x-pp-secret",
  secretHeaderValue: "Verein2025!Entnahme",

  allowedUnits: ["Flasche", "Kiste"]
};

// ---- Globale Variablen/DOM ----
let articles = []; // [{key, name}]
const grid    = document.getElementById("itemsGrid");
const teamSel = document.getElementById("team");
const msg     = document.getElementById("msg");

// Warenkorb-Status als Plain Object: { [articleKey]: { Flasche:number, Kiste:number, name:string } }
const state = {};

// ---- kleine Utils ----
const $ = (id) => document.getElementById(id);

function setMsg(text, type) {
  msg.className = "msg" + (type ? " " + type : "");
  msg.textContent = text || "";
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Für DOM-IDs (keine Leer-/Sonderzeichen): "Bier Kiste" -> "Bier_Kiste"
function safeId(s) {
  return String(s)
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "");
}

// ---- UI bauen ----
function buildTiles() {
  grid.innerHTML = "";
  // state leeren
  Object.keys(state).forEach(k => delete state[k]);

  articles.forEach(a => {
    const key   = a.key ?? a.Artikel ?? a.name ?? String(a);
    const label = a.name ?? a.Artikel ?? String(a);
    const skey  = safeId(key);

    // Initial in den State
    state[key] = { Flasche: 0, Kiste: 0, name: label };

    const tile = document.createElement("div");
    tile.className = "tile";
    tile.innerHTML = `
      <h3>${escapeHtml(label)}</h3>
      ${CONFIG.allowedUnits.map(u => {
        const su = safeId(u);
        return `
          <div class="row">
            <span class="badge">${escapeHtml(u)}</span>
            <div class="counter">
              <button type="button" class="btn-ctr" data-article="${escapeHtml(key)}" data-unit="${escapeHtml(u)}" data-delta="-1">–</button>
              <span class="qty" id="qty-${skey}-${su}">0</span>
              <button type="button" class="btn-ctr" data-article="${escapeHtml(key)}" data-unit="${escapeHtml(u)}" data-delta="1">+</button>
            </div>
          </div>
        `;
      }).join("")}
    `;
    grid.appendChild(tile);
  });
}

// Ein einziger delegierter Click-Listener (außerhalb von buildTiles)
grid.addEventListener("click", (e) => {
  const btn = e.target.closest("button.btn-ctr");
  if (!btn) return;
  e.preventDefault();

  const key   = btn.dataset.article;
  const unit  = btn.dataset.unit;        // "Flasche" | "Kiste"
  const delta = parseInt(btn.dataset.delta, 10);

  // Sicherstellen, dass der State-Eintrag existiert
  if (!state[key]) {
    state[key] = { Flasche: 0, Kiste: 0, name: key };
  }

  const current = Number(state[key][unit] || 0);
  const next    = Math.max(0, current + (Number.isFinite(delta) ? delta : 0));
  state[key][unit] = next;

  const skey = safeId(key);
  const su   = safeId(unit);
  const qtyEl = document.getElementById(`qty-${skey}-${su}`);
  if (qtyEl) qtyEl.textContent = String(next);
});

// ---- Formular-Aktionen ----
function resetForm() {
  // Team
  teamSel.value = "";

  // Mengen in State & UI zurücksetzen
  Object.entries(state).forEach(([key, entry]) => {
    CONFIG.allowedUnits.forEach(u => {
      entry[u] = 0;
      const qtyEl = document.getElementById(`qty-${safeId(key)}-${safeId(u)}`);
      if (qtyEl) qtyEl.textContent = "0";
    });
  });

  setMsg("");
}

function collectPayload() {
  const team = (teamSel.value || "").trim();
  const positions = [];

  Object.entries(state).forEach(([key, entry]) => {
    CONFIG.allowedUnits.forEach(u => {
      const menge = Number(entry[u] || 0);
      if (menge > 0) positions.push({ artikel: key, einheit: u, menge });
    });
  });

  return {
    team,
    positions,
    quelle: "MiniWebApp",
    clientTime: new Date().toISOString()
  };
}

// ---- Normalizer für Lookup-Response ----
function normalizeTeams(payload) {
  const arr = Array.isArray(payload) ? payload : (payload?.body ?? []);
  return arr.map(t => ({
    id:   t.id   ?? t.Teamname ?? t.name ?? "",
    name: t.name ?? t.Teamname ?? String(t.id ?? "")
  })).filter(t => t.id && t.name);
}

function normalizeArticles(payload) {
  const arr = Array.isArray(payload) ? payload : (payload?.body ?? []);
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

    if (!res.ok || data.ok === false) {
      throw new Error(data.message || `HTTP ${res.status}`);
    }

    const teamsNorm    = normalizeTeams(data.teams);
    const articlesNorm = normalizeArticles(data.articles);

    if (!teamsNorm.length || !articlesNorm.length) {
      throw new Error("Ungültiges Lookup-Format oder leere Daten");
    }

    // Team-Select aufbauen
    teamSel.innerHTML =
      `<option value="">– bitte Team wählen –</option>` +
      teamsNorm.map(t =>
        `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`
      ).join("");

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

  if (!payload.team) {
    setMsg("Bitte ein Team wählen.", "err");
    return;
  }
  if (payload.positions.length === 0) {
    setMsg("Bitte mindestens eine Menge über die ±‑Buttons setzen.", "err");
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
    if (!res.ok || data.ok === false) {
      throw new Error(data.message || `HTTP ${res.status}`);
    }

    setMsg(
      `Danke! Vorgangscode: ${data.submissionId || "–"} · Positionen: ${data.positionsWritten ?? payload.positions.length}`,
      "ok"
    );
    resetForm();
  } catch (err) {
    console.error(err);
    setMsg("Fehler bei der Übermittlung. Bitte später erneut versuchen.", "err");
  }
}

// ---- Events & Init ----
document.getElementById("submitBtn").addEventListener("click", (e) => {
  e.preventDefault();
  submitData();
});

document.getElementById("resetBtn").addEventListener("click", (e) => {
  e.preventDefault();
  resetForm();
});

fetchLookups();
