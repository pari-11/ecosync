const HEAVY_THRESHOLD_MINS = 1/6; // DEMO: 10 seconds | PROD: change to 10

let heavyTabs = [];
let tabClassification = {};
let overlayLastShown = null;
let overlaySuppressed = false;
let sessionCO2 = 0;

const OVERLAY_COOLDOWN_MS = 30 * 60 * 1000;
const heavyTabStartTimes = {};

// ─── Classify tab ─────────────────────────────────────────────
function classifyTab(tab) {
  if (!tab || !tab.url) return;

  const url = tab.url.toLowerCase();
  const isAudible = tab.audible || false;
  let weight = 'static';

  if (
    url.includes('youtube.com') || url.includes('twitch.tv') ||
    url.includes('netflix.com') || url.includes('hotstar.com') ||
    url.includes('primevideo.com') || url.includes('jiocinema.com')
  ) {
    weight = isAudible ? 'heavy-video' : 'heavy';
  } else if (
    url.includes('twitter.com') || url.includes('x.com') ||
    url.includes('instagram.com') || url.includes('facebook.com') ||
    url.includes('reddit.com') || url.includes('slack.com') ||
    url.includes('teams.microsoft.com') || url.includes('mail.google.com') ||
    url.includes('discord.com') || url.includes('whatsapp.web')
  ) {
    weight = 'dynamic';
  } else if (
    url.includes('docs.google.com') || url.includes('stackoverflow.com') ||
    url.includes('wikipedia.org') || url.includes('github.com') ||
    url.includes('notion.so') || url.includes('medium.com')
  ) {
    weight = 'static';
  }

  tabClassification[tab.id] = {
    id: tab.id,
    title: tab.title || tab.url,
    url: tab.url,
    weight,
    audible: isAudible,
    power: getPowerEstimate(weight)
  };

  if (weight === 'heavy' || weight === 'heavy-video') {
    if (!heavyTabs.includes(tab.id)) heavyTabs.push(tab.id);
    scheduleHeavyAlarm(tab.id);
  } else {
    heavyTabs = heavyTabs.filter(id => id !== tab.id);
    cancelHeavyAlarm(tab.id);
  }
}

function getPowerEstimate(weight) {
  return { static: 0.5, dynamic: 5, heavy: 10, 'heavy-video': 15 }[weight] || 0.5;
}

// ─── Alarm-based timer ────────────────────────────────────────
function scheduleHeavyAlarm(tabId) {
  const alarmName = `heavy-tab-${tabId}`;
  chrome.alarms.get(alarmName, (existing) => {
    if (!existing) {
      chrome.alarms.create(alarmName, { delayInMinutes: HEAVY_THRESHOLD_MINS });
    }
  });
}

function cancelHeavyAlarm(tabId) {
  chrome.alarms.clear(`heavy-tab-${tabId}`);
}

// ─── Push state to backend ────────────────────────────────────
function pushStateToBackend(carbonIntensity, co2Rate, totalPower, heavyCount) {
  const allTabs = Object.values(tabClassification).filter(Boolean);
  fetch('http://localhost:8000/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tabs: allTabs,
      heavyCount,
      totalPower,
      carbonIntensity,
      co2Rate,
      sessionCO2,
      updatedAt: new Date().toISOString()
    })
  }).catch(() => {});
}

// ─── Alarm fires ──────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith('heavy-tab-')) return;

  const tabId = parseInt(alarm.name.replace('heavy-tab-', ''));

  chrome.tabs.get(tabId, async (tab) => {
    if (chrome.runtime.lastError || !tab) return;

    const tabData = tabClassification[tabId];
    if (!tabData || (tabData.weight !== 'heavy' && tabData.weight !== 'heavy-video')) return;

    const allTabs = Object.values(tabClassification).filter(Boolean);
    const heavyCount = allTabs.filter(t => t.weight === 'heavy' || t.weight === 'heavy-video').length;
    const totalPower = allTabs.reduce((s, t) => s + t.power, 0).toFixed(1);

    let carbonIntensity = 0;
    let co2Rate = 0;
    try {
      const res = await fetch('http://localhost:8000/api/carbon/live/in');
      const data = await res.json();
      carbonIntensity = data.intensity;
      co2Rate = ((parseFloat(totalPower) * carbonIntensity) / 1000).toFixed(1);
      sessionCO2 += parseFloat(co2Rate) * (10 / 3600);
    } catch (_) {}

    // ── Push to backend so website can read it ──
    pushStateToBackend(carbonIntensity, co2Rate, totalPower, heavyCount);

    const stats = { heavyCount, totalPower, carbonIntensity, co2Rate };

    // Overlay — only when >3 heavy tabs + cooldown passed
    const now = Date.now();
    const cooldownPassed = overlayLastShown === null || (now - overlayLastShown) > OVERLAY_COOLDOWN_MS;

    if (heavyCount > 3 && !overlaySuppressed && cooldownPassed) {
      overlayLastShown = Date.now();
      chrome.tabs.query({ active: true, currentWindow: true }, (activeTabs) => {
        if (!activeTabs || activeTabs.length === 0) return;
        injectOverlay(activeTabs[0].id, stats);
      });
    }

    if (heavyCount > 3) {
      chrome.notifications.create(`alert-${tabId}-${Date.now()}`, {
        type: 'basic',
        iconUrl: 'globe.png',
        title: '🌍 EcoSync — Heavy Tab Alert',
        message: `${heavyCount} heavy tabs open • ${totalPower}W • ${co2Rate}g CO₂/hr`,
        priority: 2
      });
    }

    chrome.alarms.create(`heavy-tab-${tabId}`, { delayInMinutes: HEAVY_THRESHOLD_MINS });
  });
});

// ─── Overlay injector ─────────────────────────────────────────
function injectOverlay(tabId, stats) {
  chrome.scripting.executeScript({
    target: { tabId },
    func: (s) => {
      if (document.getElementById('tab-auditor-overlay')) return;

      const overlay = document.createElement('div');
      overlay.id = 'tab-auditor-overlay';
      overlay.style.cssText = `
        position:fixed;top:20px;right:20px;z-index:2147483647;
        background:#0f1117ee;color:#fff;border-radius:14px;
        padding:16px 20px;font-family:'Segoe UI',sans-serif;font-size:13px;
        box-shadow:0 4px 24px #00000088;border:1px solid #ffffff18;
        min-width:230px;opacity:0;transition:opacity 0.4s ease;
        backdrop-filter:blur(8px);
      `;
      overlay.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <span style="font-size:18px;">🌍</span>
          <span style="font-weight:700;font-size:15px;">EcoSync Alert</span>
        </div>
        <div style="color:#ff8a80;font-size:12px;margin-bottom:10px;">
          ⚠️ Heavy tab open for 10+ minutes
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <div style="background:#ffffff0d;border-radius:8px;padding:8px;text-align:center;">
            <div style="font-size:18px;font-weight:700;color:#e53935;">${s.heavyCount}</div>
            <div style="font-size:10px;color:#aaa;">Heavy Tabs</div>
          </div>
          <div style="background:#ffffff0d;border-radius:8px;padding:8px;text-align:center;">
            <div style="font-size:18px;font-weight:700;color:#fff;">${s.totalPower}W</div>
            <div style="font-size:10px;color:#aaa;">Est. Power</div>
          </div>
          <div style="background:#ffffff0d;border-radius:8px;padding:8px;text-align:center;">
            <div style="font-size:18px;font-weight:700;color:#fff;">${s.carbonIntensity}</div>
            <div style="font-size:10px;color:#aaa;">gCO₂/kWh</div>
          </div>
          <div style="background:#ffffff0d;border-radius:8px;padding:8px;text-align:center;">
            <div style="font-size:18px;font-weight:700;color:#f9a825;">${s.co2Rate}g</div>
            <div style="font-size:10px;color:#aaa;">CO₂/hr</div>
          </div>
        </div>
        <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center;">
          <button id="ta-dismiss" style="
            background:#ffffff15;border:none;color:#aaa;font-size:11px;
            padding:5px 10px;border-radius:6px;cursor:pointer;">✕ Dismiss</button>
          <button id="ta-suppress" style="
            background:#ffffff15;border:none;color:#aaa;font-size:11px;
            padding:5px 10px;border-radius:6px;cursor:pointer;">🔕 Don't show again</button>
        </div>
      `;
      document.body.appendChild(overlay);

      document.getElementById('ta-dismiss').onclick = () => overlay.remove();
      document.getElementById('ta-suppress').onclick = () => {
        overlay.remove();
        chrome.runtime.sendMessage({ action: 'suppressOverlay' });
      };

      requestAnimationFrame(() => requestAnimationFrame(() => {
        overlay.style.opacity = '1';
      }));

      setTimeout(() => {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 500);
      }, 6000);
    },
    args: [stats]
  }).catch(err => console.warn('[EcoSync] Overlay inject failed:', err));
}

// ─── Listeners ────────────────────────────────────────────────
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.audible !== undefined) {
    classifyTab(tab);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabClassification[tabId];
  heavyTabs = heavyTabs.filter(id => id !== tabId);
  cancelHeavyAlarm(tabId);
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getHeavyTabs') {
    sendResponse({
      heavyCount: heavyTabs.length,
      heavyTabs: heavyTabs.map(id => tabClassification[id]).filter(Boolean),
      allTabs: Object.values(tabClassification)
    });
  }
  if (request.action === 'suppressOverlay') {
    overlaySuppressed = true;
    sendResponse({ ok: true });
  }
  if (request.action === 'getSessionCO2') {
    sendResponse({ total: sessionCO2 });
  }
});

// Classify all already-open tabs on load
chrome.tabs.query({}, (tabs) => {
  tabs.forEach(tab => classifyTab(tab));
});


// ─── Periodic state push every 10s (independent of heavy tabs) ───
chrome.alarms.create('ecosync-state-push', { periodInMinutes: 1/6 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'ecosync-state-push') return;

  const allTabs = Object.values(tabClassification).filter(Boolean);
  const heavyCount = allTabs.filter(t => t.weight === 'heavy' || t.weight === 'heavy-video').length;
  const totalPower = allTabs.reduce((s, t) => s + t.power, 0).toFixed(1);

  let carbonIntensity = 0;
  let co2Rate = 0;
  try {
    const res = await fetch('http://localhost:8000/api/carbon/live/in');
    const data = await res.json();
    carbonIntensity = data.intensity || 0;
    co2Rate = ((parseFloat(totalPower) * carbonIntensity) / 1000).toFixed(1);
    sessionCO2 += parseFloat(co2Rate) * (10 / 3600);
  } catch (_) {}

  pushStateToBackend(carbonIntensity, co2Rate, totalPower, heavyCount);
});
