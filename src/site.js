'use strict';
// Local-only learning state. Storage denial never disables a demonstration.
(() => {
  const key = 'orbitalhw:orbit:v1';
  let saved = null;
  try {
    const raw = localStorage.getItem(key);
    if (raw && raw.length < 16384) saved = JSON.parse(raw);
  } catch { /* Private browsing can deny persistence. */ }
  window.orbitalState = {
    widgetState: saved,
    async setWidgetState(state) {
      this.widgetState = state;
      try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* In-memory state remains usable. */ }
    },
  };
  const wrapDegrees = radians => {
    const degrees = Math.round(radians * 180 / Math.PI);
    return ((degrees + 180) % 360 + 360) % 360 - 180;
  };
  function refreshTransfer() {
    const debug = document.getElementById('orbit-learning-lab')?.orbitDebug;
    if (!debug) return;
    const row = debug.current, config = debug.config;
    const link = document.getElementById('inspect-solar');
    if (!link) return;
    const target = new URL(link.href);
    target.searchParams.set('theta', wrapDegrees(row.s[1]));
    target.searchParams.set('phi', wrapDegrees(config.phase * Math.PI / 180 + debug.constants.OS * row.t));
    target.searchParams.set('from', 'orbit');
    link.href = target.href;
  }
  document.addEventListener('orbitalhw:state', refreshTransfer);
  document.getElementById('inspect-solar')?.addEventListener('click', () => {
    refreshTransfer();
    const debug = document.getElementById('orbit-learning-lab')?.orbitDebug;
    if (!debug) return;
    if (document.getElementById('ol-play').textContent === 'Pause') document.getElementById('ol-play').click();
    window.orbitalState.setWidgetState({modelContent:null,privateContent:{...debug.config}});
  });
  const solar = document.getElementById('solar-acceleration-app');
  function editedSolar(event) {
    if (!event.target.closest('input, button')) return;
    const reset = event.target.closest('#reset');
    document.getElementById('solar-import-status').textContent = reset
      ? 'Reset to the original teaching example. These angles are independent of the orbit snapshot.'
      : 'Exploring edited angles independently. Return to the orbit to import another moment.';
    try { history.replaceState(null, '', location.pathname + location.hash); } catch { /* Some local file policies disallow URL updates. */ }
  }
  solar?.addEventListener('input', editedSolar);
  solar?.addEventListener('change', editedSolar);
  solar?.addEventListener('click', event => {
    if (event.target.closest('button')) editedSolar(event);
  });
})();
