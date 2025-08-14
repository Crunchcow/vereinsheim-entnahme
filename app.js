<script>
// ============================
// Vereinsheim – Kühlschrank-Entnahme (WebApp)
// ============================

// ---- Konfiguration ----
const CONFIG = {
  // Lookup-Flow (GET)
  lookupEndpoint:
    "https://defaulteee05d909b754472b1cd58561389d4.d0.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/f783fa9e5318425c99947d805c4cd10f/triggers/manual/paths/invoke/?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=I5HNEZ3GG1im8YwjO6FP61EkuyekTrJ0_U-XYv3Cg7Q&key=vwX7-84jhs",

  // Submit-Flow (POST)
  endpoint:
    "https://defaulteee05d909b754472b1cd58561389d4.d0.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/3960e2006ecf4edd964af0e72a034dcc/triggers/manual/paths/invoke/?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=r1rgrJxrW_NOB1eLHGW61uPXpMFToympIICc3oKTVOg",

  secretHeaderName: "x-pp-secret",
  secretHeaderValue: "Verein2025!Entnahme",

  allowedUnits: ["Flasche", "Kiste"]
};

// ---- Globale Variablen/DOM ----
let articles = []; // [{key, name}]
const grid    = document.getElementById("itemsGrid");
const teamSel = document.getElementById("team");
const msg     = document.getElementById("msg");
const submitBtn = document.getElementById("submitBtn");
const resetBtn  = document.getElementById("resetBtn");

// Warenkorb-Status
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
  Object.keys(state).forEach(k => delete state[k]);

  articles.forEach(a => {
    const key   = a.key ?? a.Artikel ?? a.name ?? String(a);
    const label = a.name ?? a.Artikel ?? String(a);
    const skey  = safeId(key);

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

grid.addEventListener("click", (e) => {
  const btn = e.target.closest("button.btn-ctr");
  if (!btn) return;
  e.preventDefault();

  const key   = btn.dataset.article;
  const unit  = btn.dataset.unit;
  const delta = parseInt(btn.dataset.delta, 10);

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
function resetForm(clearMsg = false) {
  teamSel.value = "";

  Object.entries(state).forEach(([key, entry]) => {
    CONFIG.allowedUnits.forEach(u => {
      entry[u] = 0;
      const qtyEl = document.getElementById(`qty-${safeId(key)}-${safeId(u)}`);
      if (qtyEl) qtyEl.textContent = "0";
    });
  });

  if (clearMsg) setMsg("");
}

function collectPayload() {
  const teamVal = (teamSel.value || "").trim();
  const positions = [];

  Object.entries(state).forEach(([key, entry]) => {
    CONFIG.allowedUnits.forEach(u => {
      const menge = Number(entry[u] || 0);
      if (menge > 0) positions.push({ artikel: key, einheit: u, menge });
    });
  });

  return {
    submissionId: (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    teamname: teamVal,                          // Flow: Spalte Teamname
    datum: new Date().toISOString().slice(0,10),// yyyy-MM-dd
    quelle: "MiniWebApp",
    positions
  };
}

// ---- Flexible Lookup-Pfade ----
// Hilfsfunktion: extrahiert sicher ein Array aus möglichen Pfaden
function pickArray(obj, ...paths) {
  for (const p of paths) {
    const v = p.split('.').reduce((acc, k) => (acc && acc[k] != null ? acc[k] : undefined), obj);
    if (Array.isArray(v) && v.length >= 0) return v;
  }
  return [];
}

function normalizeTeams(raw) {
  // akzeptierte Formen:
  // - raw = Array
  // - raw = { body: Array }
  // - raw = { teams: Array } oder { teams: { body: Array } }
  const arr = Array.isArray(raw) ? raw
            : pickArray(raw, 'body', 'teams', 'teams.body', 'value', 'data');
  return arr.map(t => {
    const id   = t.id ?? t.Teamname ?? t.name ?? t.teamname ?? '';
    const name = t.name ?? t.Teamname ?? t.teamname ?? String(id || '');
    return { id, name };
  }).filter(t => t.id || t.name);
}

function normalizeArticles(raw) {
  // akzeptierte Formen:
  // - raw = Array
  // - raw = { body: Array }
  // - raw = { articles: Array } oder { articles: { body: Array } }
  const arr = Array.isArray(raw) ? raw
            : pickArray(raw, 'body', 'articles', 'articles.body', 'value', 'data');
  return arr.map(a => {
    const key  = a.key ?? a.Artikel ?? a.name ?? '';
    const name = a.name ?? a.Artikel ?? String(key || '');
    return { key, name };
  }).filter(a => a.key && a.name);
}

// ---- Lookups laden ----
async function fetchLookups() {
  try {
    setMsg("Lade Daten…");
    const res = await fetch(CONFIG.lookupEndpoint, { method: "GET" });
    const data = await res.json().catch(() => ({}));
    console.debug("Lookup-Rohdaten:", data);

    if (!res.ok) {
      throw new Error(data?.message || `HTTP ${res.status}`);
    }

    // Robust extrahieren – akzeptiere data.teams / data.body.teams / data / etc.
    const teamsNorm    = normalizeTeams(data.teams ?? data?.body?.teams ?? data);
    const articlesNorm = normalizeArticles(data.articles ?? data?.body?.articles ?? data);

    console.debug("Teams (norm):", teamsNorm);
    console.debug("Artikel (norm):", articlesNorm);

    if (!teamsNorm.length || !articlesNorm.length) {
      throw new Error("Ungültiges Lookup-Format oder leere Daten");
    }

    // Team-Select aufbauen (value = sichtbarer Name → passt zu tblVerbrauch.Teamname)
    teamSel.innerHTML =
      `<option value="">– bitte Team wählen –</option>` +
      teamsNorm.map(t =>
        `<option value="${escapeHtml(t.name)}">${escapeHtml(t.name)}</option>`
      ).join("");

    // Artikel speichern & Kacheln rendern
    articles = articlesNorm;
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

  if (!payload.teamname) {
    setMsg("Bitte ein Team wählen.", "err");
    return;
  }
  if (payload.positions.length === 0) {
    setMsg("Bitte mindestens eine Menge über die ±-Buttons setzen.", "err");
    return;
  }

  try {
    submitBtn.disabled = true;
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

    if (!res.ok || data?.ok === false) {
      throw new Error(data?.message || `HTTP ${res.status}`);
    }

    resetForm(false); // Form leeren, Meldung behalten
    setMsg(
      `Danke! Vorgangscode: ${data.submissionId || payload.submissionId} · Positionen: ${data.positionsWritten ?? payload.positions.length}`,
      "ok"
    );

    if (Array.isArray(data.results)) {
      console.log("Ergebnisse:", data.results);
    }
  } catch (err) {
    console.error(err);
    setMsg("Fehler bei der Übermittlung. Bitte später erneut versuchen.", "err");
  } finally {
    submitBtn.disabled = false;
  }
}

// ---- Events & Init ----
submitBtn.addEventListener("click", (e) => {
  e.preventDefault();
  submitData();
});

resetBtn.addEventListener("click", (e) => {
  e.preventDefault();
  resetForm(true);
});

fetchLookups();
</script>
