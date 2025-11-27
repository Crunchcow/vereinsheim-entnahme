// ============================
// Vereinsheim – Kühlschrank-Entnahme (WebApp)
// ============================

console.debug("[app] booting…");

// ---- Konfiguration ----
const CONFIG = {
  lookupEndpoint:
    "https://defaulteee05d909b754472b1cd58561389d4.d0.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/f783fa9e5318425c99947d805c4cd10f/triggers/manual/paths/invoke/?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=I5HNEZ3GG1im8YwjO6FP61EkuyekTrJ0_U-XYv3Cg7Q&key=vwX7-84jhs",

  endpoint:
    "https://defaulteee05d909b754472b1cd58561389d4.d0.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/3960e2006ecf4edd964af0e72a034dcc/triggers/manual/paths/invoke/?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=r1rgrJxrW_NOB1eLHGW61uPXpMFToympIICc3oKTVOg",

  // NEU: separater Endpoint für Feedback (kommt später aus Power Automate)
  feedbackEndpoint: "https://defaulteee05d909b754472b1cd58561389d4.d0.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/fc3375b25aec435997ba4cb3b61dec74/triggers/manual/paths/invoke?api-version=1",
  
  secretHeaderName: "x-pp-secret",
  secretHeaderValue: "Verein2025!Entnahme",

  allowedUnits: ["Flasche", "Kiste"]
};

// ---- DOM-Referenzen ----
const grid      = document.getElementById("itemsGrid");
const teamSel   = document.getElementById("team");
const msg       = document.getElementById("msg");
const submitBtn = document.getElementById("submitBtn");
const resetBtn  = document.getElementById("resetBtn");
const payload = { text };

console.debug("[app] dom:", { grid: !!grid, teamSel: !!teamSel, msg: !!msg, submitBtn: !!submitBtn, resetBtn: !!resetBtn });

// ---- globaler Fehlerhaken (zeigt Fehler im UI)
window.addEventListener("error", (e) => {
  console.error("[app] uncaught:", e.error || e.message || e);
  if (msg) {
    msg.className = "msg err";
    msg.textContent = "Ein Fehler ist aufgetreten. Siehe Konsole (F12).";
  }
});

// ---- State ----
let articles = []; // [{key,name}]
const state = {};  // { [articleKey]: { Flasche:number, Kiste:number, name:string } }

// ---- Utils ----
const $ = (id) => document.getElementById(id);

function setMsg(text, type) {
  if (!msg) return;
  msg.className = "msg" + (type ? " " + type : "");
  msg.textContent = text || "";
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function safeId(s) {
  return String(s).normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "");
}

// ---- UI ----
function buildTiles() {
  if (!grid) return;
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

if (grid) {
  grid.addEventListener("click", (e) => {
    const btn = e.target.closest("button.btn-ctr");
    if (!btn) return;
    e.preventDefault();
    const key = btn.dataset.article;
    const unit = btn.dataset.unit;
    const delta = parseInt(btn.dataset.delta, 10) || 0;
    if (!state[key]) state[key] = { Flasche: 0, Kiste: 0, name: key };
    const next = Math.max(0, (Number(state[key][unit]) || 0) + delta);
    state[key][unit] = next;
    const qtyEl = document.getElementById(`qty-${safeId(key)}-${safeId(unit)}`);
    if (qtyEl) qtyEl.textContent = String(next);
  });
}

// ---- Form Actions ----
function resetForm(clearMsg = false) {
  if (teamSel) teamSel.value = "";
  Object.entries(state).forEach(([key, entry]) => {
    CONFIG.allowedUnits.forEach(u => {
      entry[u] = 0;
      const el = document.getElementById(`qty-${safeId(key)}-${safeId(u)}`);
      if (el) el.textContent = "0";
    });
  });
  if (clearMsg) setMsg("");
}

function collectPayload() {
  const teamVal = (teamSel?.value || "").trim();
  const positions = [];
  Object.entries(state).forEach(([key, entry]) => {
    CONFIG.allowedUnits.forEach(u => {
      const menge = Number(entry[u] || 0);
      if (menge > 0) positions.push({ artikel: key, einheit: u, menge });
    });
  });
  return {
    submissionId: (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    teamname: teamVal,
    datum: new Date().toISOString().slice(0,10),
    quelle: "MiniWebApp",
    positions
  };
}

// ---- Normalizer  ----
function pickArray(obj, ...paths) {
  for (const p of paths) {
    const v = p.split(".").reduce((acc, k) => (acc && acc[k] != null ? acc[k] : undefined), obj);
    if (Array.isArray(v)) return v;
  }
  return [];
}

function normalizeTeams(raw) {
  const arr = Array.isArray(raw) ? raw : pickArray(raw, "body", "teams", "teams.body", "value", "data");
  return arr.map(t => {
    const name = t.name ?? t.Teamname ?? t.teamname ?? t.id ?? "";
    const id   = t.id   ?? name;
    return { id, name };
  }).filter(t => t.name);
}

function normalizeArticles(raw) {
  const arr = Array.isArray(raw) ? raw : pickArray(raw, "body", "articles", "articles.body", "value", "data");
  return arr.map(a => {
    const key  = a.key ?? a.Artikel ?? a.name ?? "";
    const name = a.name ?? a.Artikel ?? key;
    return { key, name };
  }).filter(a => a.key && a.name);
}

// Feedback Flow
async function sendFeedback() {
  const text = (feedbackTextEl?.value || "").trim();
  if (!text) {
    alert("Bitte gib Feedback ein.");
    return;
  }

  // solange noch kein Flow eingerichtet ist
  if (!CONFIG.feedbackEndpoint) {
    alert("Danke für dein Feedback! (Feedback-Flow noch nicht eingerichtet)");
    closeFeedback();
    return;
  }

  const payload = { text };

  try {
    setMsg("Sende Feedback…");

    const res = await fetch(CONFIG.feedbackEndpoint, {
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

    setMsg("Danke für dein Feedback! 🙌", "ok");
    closeFeedback();
  } catch (err) {
    console.error("[feedback] error", err);
    setMsg("Feedback konnte nicht gesendet werden.", "err");
  }
}


// ---- Lookups ----
async function fetchLookups() {
  try {
    console.debug("[lookup] GET", CONFIG.lookupEndpoint);
    setMsg("Lade Daten…");
    const res = await fetch(CONFIG.lookupEndpoint, { method: "GET" });
    console.debug("[lookup] status", res.status);
    const data = await res.json().catch(() => ({}));
    console.debug("[lookup] raw", data);

    if (!res.ok || data.ok === false) {
      throw new Error(data.message || `HTTP ${res.status}`);
    }

    const teamsNorm    = normalizeTeams(data.teams ?? data?.body?.teams ?? data);
    const articlesNorm = normalizeArticles(data.articles ?? data?.body?.articles ?? data);
    console.debug("[lookup] norm", { teams: teamsNorm.length, articles: articlesNorm.length });

    if (!teamSel || !grid) throw new Error("DOM nicht bereit (teamSel/grid fehlt)");
    if (!teamsNorm.length || !articlesNorm.length) throw new Error("Ungültiges Lookup-Format oder leere Daten");

    teamSel.innerHTML =
      `<option value="">– bitte Team wählen –</option>` +
      teamsNorm.map(t => `<option value="${escapeHtml(t.name)}">${escapeHtml(t.name)}</option>`).join("");

    articles = articlesNorm;
    buildTiles();
    setMsg("");
  } catch (err) {
    console.error("[lookup] error", err);
    setMsg("Konnte Teams/Artikel nicht laden. Bitte später erneut versuchen.", "err");
  }
}

// ---- Submit ----
async function submitData() {
  const payload = collectPayload();
  if (!payload.teamname) return setMsg("Bitte ein Team wählen.", "err");
  if (payload.positions.length === 0) return setMsg("Bitte mindestens eine Menge über die ±‑Buttons setzen.", "err");

  try {
    if (submitBtn) submitBtn.disabled = true;
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
    if (!res.ok || data?.ok === false) throw new Error(data?.message || `HTTP ${res.status}`);

    resetForm(false);
    setMsg(
      `Danke! Vorgangscode: ${data.submissionId || payload.submissionId} · Positionen: ${data.positionsWritten ?? payload.positions.length}`,
      "ok"
    );
    if (Array.isArray(data.results)) console.log("Ergebnisse:", data.results);
  } catch (err) {
    console.error("[submit] error", err);
    setMsg("Fehler bei der Übermittlung. Bitte später erneut versuchen.", "err");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

// ---- Events & Init ----
if (submitBtn) submitBtn.addEventListener("click", (e) => { e.preventDefault(); submitData(); });
if (resetBtn)  resetBtn.addEventListener("click",  (e) => { e.preventDefault(); resetForm(true); });

// Feedback öffnen
if (feedbackBtn && feedbackDialog) {
  feedbackBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (feedbackTextEl) feedbackTextEl.value = "";
    if (feedbackDialog.showModal) {
      feedbackDialog.showModal();
    } else {
      // Fallback: simples alert, falls dialog-Element nicht unterstützt würde
      alert("Dein Browser unterstützt den Feedback-Dialog nicht.");
    }
  });
}

// Feedback abbrechen
if (feedbackCancelBtn && feedbackDialog) {
  feedbackCancelBtn.addEventListener("click", (e) => {
    e.preventDefault();
    feedbackDialog.close();
  });
}

// Feedback senden
if (feedbackSendBtn) {
  feedbackSendBtn.addEventListener("click", (e) => {
    e.preventDefault();
    submitFeedback();
  });
}

// mehrfach abgesichert starten
fetchLookups();                                   // sofort (bei defer)
window.addEventListener("DOMContentLoaded", fetchLookups);
window.addEventListener("load", fetchLookups);

// Debug-Hilfen
window._fetchLookups = fetchLookups;
window._state = state;
console.debug("[app] ready.");

