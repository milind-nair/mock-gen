import { MockGenConfig } from './config.js';

export function renderInspectorHtml(config: MockGenConfig): string {
  const endpoints = {
    logs: config.endpoints.logs,
    state: config.endpoints.state,
    reset: config.stateResetEndpoint
  };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Mock Inspector</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4f1ea;
      --bg-2: #f9f7f2;
      --ink: #1f1b16;
      --muted: #6b5f52;
      --accent: #c96a3b;
      --accent-2: #2f6f7e;
      --border: rgba(31, 27, 22, 0.12);
      --shadow: 0 14px 40px rgba(31, 27, 22, 0.12);
      font-family: "Space Grotesk", "Segoe UI", system-ui, -apple-system, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: radial-gradient(circle at top left, #f9efe1 0%, #f1efe8 38%, #f4f1ea 100%);
      color: var(--ink);
      min-height: 100vh;
    }
    header {
      padding: 24px 32px 0 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    header h1 {
      margin: 0;
      font-size: 24px;
      letter-spacing: 0.02em;
    }
    header p {
      margin: 6px 0 0 0;
      color: var(--muted);
      font-size: 14px;
    }
    .layout {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 20px;
      padding: 24px 32px 40px 32px;
    }
    .panel {
      background: var(--bg-2);
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: var(--shadow);
      padding: 18px;
      min-height: 320px;
      display: flex;
      flex-direction: column;
      animation: fadeIn 400ms ease-out;
    }
    .panel h2 {
      margin: 0 0 12px 0;
      font-size: 16px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .log-list {
      display: grid;
      gap: 10px;
      overflow: auto;
      flex: 1;
    }
    .log-card {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 10px 12px;
      background: white;
      cursor: pointer;
      transition: transform 120ms ease, box-shadow 120ms ease;
    }
    .log-card:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(31, 27, 22, 0.08);
    }
    .log-card.active {
      border-color: var(--accent);
      background: #fff6f0;
    }
    .log-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-size: 13px;
    }
    .pill {
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 12px;
      background: rgba(201, 106, 59, 0.12);
      color: var(--accent);
      font-weight: 600;
    }
    .pill.ok { background: rgba(47, 111, 126, 0.12); color: var(--accent-2); }
    .json {
      background: #1f1b16;
      color: #f7efe5;
      border-radius: 12px;
      padding: 14px;
      font-family: "JetBrains Mono", "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-word;
      flex: 1;
      overflow: auto;
    }
    .controls {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
    }
    button {
      border: none;
      border-radius: 999px;
      padding: 8px 14px;
      font-size: 13px;
      cursor: pointer;
      background: var(--accent);
      color: white;
      transition: transform 120ms ease;
    }
    button.secondary { background: rgba(31, 27, 22, 0.1); color: var(--ink); }
    button:hover { transform: translateY(-1px); }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
    @media (max-width: 900px) {
      .layout { grid-template-columns: 1fr; }
      header { flex-direction: column; align-items: flex-start; gap: 6px; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Mock Inspector</h1>
      <p>Live requests + in-memory state</p>
    </div>
    <div class="controls">
      <button class="secondary" id="refreshBtn">Refresh</button>
      <button id="resetBtn">Reset State</button>
    </div>
  </header>

  <section class="layout">
    <div class="panel">
      <h2>Recent Requests</h2>
      <div id="logs" class="log-list">Loading…</div>
    </div>
    <div class="panel">
      <h2>Details</h2>
      <pre id="detail" class="json">Select a request to view details.</pre>
      <h2 style="margin-top:16px">State Snapshot</h2>
      <pre id="state" class="json">Loading…</pre>
    </div>
  </section>

  <script>
    const endpoints = ${JSON.stringify(endpoints)};
    const refreshMs = ${JSON.stringify(config.inspector.refreshMs)};

    const logsEl = document.getElementById('logs');
    const detailEl = document.getElementById('detail');
    const stateEl = document.getElementById('state');
    const refreshBtn = document.getElementById('refreshBtn');
    const resetBtn = document.getElementById('resetBtn');

    let currentLogs = [];
    let activeId = null;

    function formatJson(data) {
      return JSON.stringify(data, null, 2);
    }

    function renderLogs() {
      if (!currentLogs.length) {
        logsEl.innerHTML = '<div>No requests yet.</div>';
        return;
      }
      logsEl.innerHTML = currentLogs.map((log) => {
        const statusClass = log.response.status >= 400 ? '' : 'ok';
        const activeClass = log.id === activeId ? 'active' : '';
        return (
          '<div class="log-card ' + activeClass + '" data-id="' + log.id + '">' +
            '<div class="log-row">' +
              '<div>' + log.method + ' ' + log.path + '</div>' +
              '<span class="pill ' + statusClass + '">' + log.response.status + '</span>' +
            '</div>' +
            '<div class="log-row" style="color: var(--muted)">' +
              '<span>' + new Date(log.timestamp).toLocaleTimeString() + '</span>' +
              '<span>' + log.response.latency + ' ms</span>' +
            '</div>' +
          '</div>'
        );
      }).join('');

      document.querySelectorAll('.log-card').forEach((card) => {
        card.addEventListener('click', () => {
          const id = card.getAttribute('data-id');
          activeId = id;
          const selected = currentLogs.find((item) => item.id === id);
          if (selected) {
            detailEl.textContent = formatJson(selected);
          }
          renderLogs();
        });
      });
    }

    async function refresh() {
      try {
        const [logsRes, stateRes] = await Promise.all([
          fetch(endpoints.logs),
          fetch(endpoints.state)
        ]);
        const logsJson = await logsRes.json();
        const stateJson = await stateRes.json();
        currentLogs = logsJson.logs || [];
        renderLogs();
        stateEl.textContent = formatJson(stateJson.state ?? stateJson);
      } catch (error) {
        logsEl.innerHTML = '<div>Failed to fetch logs: ' + error + '</div>';
      }
    }

    refreshBtn.addEventListener('click', refresh);
    resetBtn.addEventListener('click', async () => {
      await fetch(endpoints.reset, { method: 'POST' });
      await refresh();
    });

    refresh();
    setInterval(refresh, refreshMs);
  </script>
</body>
</html>`;
}
