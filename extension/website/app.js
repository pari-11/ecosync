const API = 'http://localhost:8000';
let tabRefreshTimer = null;
let simulating = false;

// ── NAVIGATION ───────────────────────────────────────────────
function navigate(page) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  document.querySelectorAll('.page').forEach(el => {
    el.classList.toggle('active', el.id === `page-${page}`);
  });

  clearInterval(tabRefreshTimer);

  if (page === 'home' || page === 'dashboard') loadDashboard();
  if (page === 'tab-auditor') {
    loadTabs();
    tabRefreshTimer = setInterval(loadTabs, 15000);
  }
}

document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', () => navigate(el.dataset.page));
});

// ── HELPERS ──────────────────────────────────────────────────
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function tlEmoji(tl) {
  return tl === 'red' ? '🔴' : tl === 'yellow' ? '🟡' : tl === 'green' ? '🟢' : '⚪';
}

function tlLabel(tl) {
  return tl === 'red' ? 'GRID IS DIRTY' : tl === 'yellow' ? 'GRID IS MODERATE' : tl === 'green' ? 'GRID IS CLEAN' : 'UNKNOWN';
}

function pillHTML(tl) {
  const cls = tl === 'red' ? 'pill-red' : tl === 'yellow' ? 'pill-yellow' : tl === 'green' ? 'pill-green' : 'pill-blue';
  return `<span class="pill ${cls}">${tlEmoji(tl)} ${tlLabel(tl)}</span>`;
}

// ── FETCH HELPERS ────────────────────────────────────────────
async function fetchCarbon() {
  const res = await fetch(`${API}/api/carbon/live/in`);
  return await res.json();
}

async function fetchState() {
  try {
    const res = await fetch(`${API}/api/state`);
    return await res.json();
  } catch (_) {
    return { tabs: [], sessionCO2: 0, heavyCount: 0, totalPower: 0, co2Rate: 0 };
  }
}

// ── SIMULATE GREEN WINDOW ────────────────────────────────────
function toggleSimulate() {
  simulating = !simulating;
  const btn = document.getElementById('sim-btn');
  if (simulating) {
    btn.innerHTML = '⏹ Return to Normal';
    btn.style.background = 'var(--green-bg)';
    btn.style.borderColor = '#bbf7d0';
    btn.style.color = 'var(--green)';
  } else {
    btn.innerHTML = '🟢 Simulate Green Window';
    btn.style.background = '';
    btn.style.borderColor = '';
    btn.style.color = '';
  }
  loadDashboard();
}

// ── LOAD DASHBOARD ───────────────────────────────────────────
async function loadDashboard() {
  const spin = document.getElementById('dash-spin');
  if (spin) spin.classList.add('spinning');

  try {
    let [carbon, state] = await Promise.all([fetchCarbon(), fetchState()]);

    // Override carbon with simulated clean grid
    if (simulating) {
      carbon = { intensity: 87, trafficLight: 'green', zone: 'in' };
    }

    const tabs       = state.tabs || [];
    const sessionCO2 = state.sessionCO2 || 0;

    const heavy   = tabs.filter(t => t.weight === 'heavy' || t.weight === 'heavy-video');
    const dynamic = tabs.filter(t => t.weight === 'dynamic');
    const statik  = tabs.filter(t => t.weight === 'static');
    const totalPower = tabs.reduce((s, t) => s + t.power, 0).toFixed(1);
    const co2Rate    = ((parseFloat(totalPower) * carbon.intensity) / 1000).toFixed(2);
    const now = new Date().toLocaleTimeString();

    // Dashboard page
    const tlCircle = document.getElementById('dash-tl-circle');
    if (tlCircle) {
      tlCircle.className = `tl-circle tl-${carbon.trafficLight}`;
      tlCircle.textContent = tlEmoji(carbon.trafficLight);
    }
    setText('dash-intensity', simulating ? '87 (simulated)' : carbon.intensity ?? '--');
    const pillEl = document.getElementById('dash-pill');
    if (pillEl) pillEl.innerHTML = pillHTML(carbon.trafficLight);
    setText('dash-heavy',   heavy.length);
    setText('dash-dynamic', dynamic.length);
    setText('dash-static',  statik.length);
    setText('dash-power',   totalPower);
    setText('dash-co2',     co2Rate);
    setText('dash-session', sessionCO2.toFixed(4));
    setText('last-updated', simulating ? '🟢 Simulating clean grid' : `Last updated: ${now}`);

    // Home page
    setText('home-intensity', carbon.intensity ?? '--');
    setText('home-timestamp', now);
    const homeTLPill = document.getElementById('home-tl-pill');
    if (homeTLPill) homeTLPill.innerHTML = pillHTML(carbon.trafficLight);
    setText('home-power',       totalPower);
    setText('home-co2',         co2Rate);
    setText('home-session-co2', sessionCO2.toFixed(4));
    setText('home-tab-count',   tabs.length);
    setText('home-heavy',       heavy.length);
    setText('home-dynamic',     dynamic.length);
    setText('home-static',      statik.length);

  } catch (e) {
    setText('dash-intensity', 'Offline');
    setText('home-intensity', 'Offline');
    console.error(e);
  }

  if (spin) spin.classList.remove('spinning');
}

// ── LOAD TABS ────────────────────────────────────────────────
async function loadTabs() {
  const spin = document.getElementById('tab-spin');
  if (spin) spin.classList.add('spinning');

  const state = await fetchState();
  const tabs  = state.tabs || [];
  const tbody = document.getElementById('tab-tbody');

  if (!tabs || tabs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:40px;color:var(--muted);">
      No tab data yet — the extension pushes data every 10s. Wait a moment and refresh.
    </td></tr>`;
    if (spin) spin.classList.remove('spinning');
    return;
  }

  tbody.innerHTML = tabs.map(tab => {
    const isHeavy  = tab.weight === 'heavy' || tab.weight === 'heavy-video';
    const rowClass = isHeavy ? 'tab-row-heavy' : tab.weight === 'dynamic' ? 'tab-row-dynamic' : 'tab-row-static';
    const badgeCls = isHeavy ? 'badge-heavy'  : tab.weight === 'dynamic' ? 'badge-dynamic'  : 'badge-static';
    const label    = tab.weight === 'heavy-video' ? 'HEAVY+AUD' : tab.weight.toUpperCase();
    const title    = (tab.title?.length > 55 ? tab.title.slice(0, 55) + '…' : tab.title) || tab.url;

    return `<tr class="${rowClass}">
      <td style="padding-left:20px;font-size:13px;">${title}</td>
      <td><span class="badge ${badgeCls}">${label}</span></td>
      <td style="font-size:13px;font-weight:600;">${tab.power}W</td>
    </tr>`;
  }).join('');

  setText('tab-last-updated', `Auto-refreshes every 15s · Last updated: ${new Date().toLocaleTimeString()}`);
  if (spin) spin.classList.remove('spinning');
}

// ── DARK MODE ────────────────────────────────────────────────
function toggleDark() {
  const isDark = document.body.classList.toggle('dark');
  const btn = document.getElementById('dark-toggle');
  btn.textContent = isDark ? '☀️ Light' : '🌙 Dark';
  localStorage.setItem('ecosync-theme', isDark ? 'dark' : 'light');
}

// Restore saved theme on load
window.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('ecosync-theme') === 'dark') {
    document.body.classList.add('dark');
    const btn = document.getElementById('dark-toggle');
    if (btn) btn.textContent = '☀️ Light';
  }
});

// ── INIT ─────────────────────────────────────────────────────
loadDashboard();
