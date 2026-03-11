const { plugin, logger } = require("@eniac/flexdesigner");
const { exec } = require("child_process");
const http = require("http");

const DEFAULT_PORT = 7123;

// uid -> { ...key, serialNumber }
const liveKeys = {};
let pluginConfig = {};

// port -> { status: null|Object, branch: null|string }
const portState = {};

function getPortState(port) {
  if (!portState[port]) portState[port] = { status: null, branch: null };
  return portState[port];
}

function keyPort(key) {
  const p = parseInt(key.data?.port, 10);
  return p > 0 && p <= 65535 ? p : DEFAULT_PORT;
}

function activePorts() {
  const ports = new Set();
  for (const info of Object.values(liveKeys)) ports.add(keyPort(info));
  return ports;
}

// ---------------------------------------------------------------------------
// IDE HTTP API  (localhost:PORT)
// ---------------------------------------------------------------------------

function callIDE(path, method = "POST", port = DEFAULT_PORT) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; clearTimeout(timer); resolve(v); } };

    // Use a real setTimeout (not socket timeout) — socket timeouts pause during system sleep,
    // but setTimeout fires immediately after wake if its deadline already passed.
    // agent:false forces a fresh TCP connection each time, avoiding dead keep-alive sockets.
    const timer = setTimeout(() => { req.destroy(); done(null); }, 3000);

    const req = http.request(
      { hostname: "127.0.0.1", port, path, method, headers: { "Content-Length": "0" }, agent: false },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => { try { done(JSON.parse(body)); } catch { done(null); } });
      }
    );
    req.on("error", () => done(null));
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Action dispatch — HTTP only
// ---------------------------------------------------------------------------

async function triggerAction(cid, key) {
  const port = keyPort(key);
  const configName = key.data?.configName || null;

  const basePaths = {
    "com.larvey.jetbrains.run":   "/run",
    "com.larvey.jetbrains.debug": "/debug",
    "com.larvey.jetbrains.test":  "/test",
    "com.larvey.jetbrains.stop":  "/stop",
    "com.larvey.jetbrains.build": "/build",
  };
  const base = basePaths[cid];
  if (!base) return;

  const path = configName ? `${base}?config=${encodeURIComponent(configName)}` : base;
  const result = await callIDE(path, "POST", port);

  if (!result) {
    logger.warn(`HTTP ${path} failed — companion plugin not running on port ${port}`);
  } else if (result.error) {
    logger.warn(`IDE error for ${path}:`, result.error);
  }
}

// ---------------------------------------------------------------------------
// Double-tap-to-stop state
// uid -> { timer }  — set when the stop window is open after first tap
// ---------------------------------------------------------------------------

const stopWindows = {};

const ACTION_CIDS = new Set(["com.larvey.jetbrains.run", "com.larvey.jetbrains.debug", "com.larvey.jetbrains.test"]);

async function handleActionTap(cid, key) {
  const port = keyPort(key);
  const { status } = getPortState(port);
  if (!status) { pollPort(port).then(updateAllKeys); return; }

  const uid = key.uid;
  const configName = key.data?.configName || null;

  const base = {
    "com.larvey.jetbrains.run":   "/run",
    "com.larvey.jetbrains.debug": "/debug",
    "com.larvey.jetbrains.test":  "/test",
  }[cid];
  const runPath = configName ? `${base}?config=${encodeURIComponent(configName)}` : base;

  const isRunning = configName
    ? (status.runningConfigs ?? []).includes(configName)
    : (status.running ?? false);

  if (!isRunning) {
    await callIDE(runPath, "POST", port);
    setTimeout(() => pollPort(port).then(updateAllKeys), 1500);
    return;
  }

  if (stopWindows[uid]) {
    clearTimeout(stopWindows[uid].timer);
    delete stopWindows[uid];
    const stopPath = configName ? `/stop?config=${encodeURIComponent(configName)}` : "/stop";
    await callIDE(stopPath, "POST", port);
    setTimeout(() => pollPort(port).then(updateAllKeys), 500);
    return;
  }

  // First tap while running → show "stop?" and wait 1 second before restarting
  const info = liveKeys[uid];
  if (info) {
    drawKey(info.serialNumber, info, {
      bgColor: "#e65100",
      icon: "mdi mdi-stop-circle",
      showIcon: true,
      showTitle: true,
      title: "stop?",
    });
  }

  stopWindows[uid] = {
    timer: setTimeout(async () => {
      delete stopWindows[uid];
      await callIDE(runPath, "POST", port);
      setTimeout(() => pollPort(port).then(updateAllKeys), 1500);
    }, 1000),
  };
}

// ---------------------------------------------------------------------------
// Ellipsis helper — truncates to fit available text area at fontSize 24
// Text centered at 62% of keyWidth; clips at right edge.
// ---------------------------------------------------------------------------

function ellipsis(text, keyWidth) {
  const maxChars = Math.max(1, Math.floor((keyWidth * 0.76 - 8) / 12));
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1) + "…";
}

// ---------------------------------------------------------------------------
// Status polling & key drawing
// ---------------------------------------------------------------------------

async function pollPort(port) {
  const status = await callIDE("/status", "GET", port);
  const ps = getPortState(port);
  ps.status = status ?? null;
  if (status?.branch) ps.branch = status.branch;
}

async function pollAllPorts() {
  const ports = activePorts();
  if (ports.size === 0) return;
  await Promise.all([...ports].map(pollPort));
  updateAllKeys();
}

function updateAllKeys() {
  for (const info of Object.values(liveKeys)) {
    const sn = info.serialNumber;
    const port = keyPort(info);
    const { status, branch } = getPortState(port);
    const connected = status !== null;

    // Run / Debug buttons
    if (info.cid === "com.larvey.jetbrains.run" || info.cid === "com.larvey.jetbrains.debug") {
      if (!connected) {
        drawKey(sn, info, { bgColor: "#1a1a1a", showIcon: true, showTitle: true, title: "Waiting for IDE" });
        continue;
      }
      const configName = info.data?.configName || "";
      const isRunning  = configName
        ? (status.runningConfigs ?? []).includes(configName)
        : (status.running ?? false);

      const defaultLabel = info.cid === "com.larvey.jetbrains.debug" ? "Debug" : "Run";
      const icon  = isRunning ? "mdi mdi-restart" : (info.cid === "com.larvey.jetbrains.debug" ? "mdi mdi-bug" : "mdi mdi-play-circle");
      const label = configName ? ellipsis(configName, info.style.width) : defaultLabel;
      drawKey(sn, info, { icon, title: label });
    }

    // Test button
    if (info.cid === "com.larvey.jetbrains.test") {
      if (!connected) {
        drawKey(sn, info, { bgColor: "#1a1a1a", showIcon: true, showTitle: true, title: "Waiting for IDE" });
        continue;
      }
      const configName = info.data?.configName || "";
      const isRunning  = configName
        ? (status.runningConfigs ?? []).includes(configName)
        : false;

      const icon  = isRunning ? "mdi mdi-restart" : "mdi mdi-test-tube";
      const label = configName ? ellipsis(configName, info.style.width) : "Test";
      drawKey(sn, info, { icon, title: label });
    }

    // Stop button — bright red when anything is running, dark when idle, grey when disconnected
    if (info.cid === "com.larvey.jetbrains.stop") {
      const bgColor = !connected ? "#1a1a1a" : (status.running ? "#e53935" : "#4a1010");
      drawKey(sn, info, { bgColor });
    }

    // Build button — grey when disconnected, restored when connected
    if (info.cid === "com.larvey.jetbrains.build") {
      if (!connected) drawKey(sn, info, { bgColor: "#1a1a1a" });
      else drawKey(sn, info, {});
    }

    // Branch key — draws from per-port branch (updated by poll or git fallback)
    if (info.cid === "com.larvey.jetbrains.branch") {
      const branchName = branch || "no branch";
      drawKey(sn, info, { showIcon: true, showTitle: true, title: ellipsis(branchName, info.style.width) });
    }
  }
}

function drawKey(serialNumber, info, { title, ...styleOverrides } = {}) {
  const key = { ...info, style: { ...info.style, ...styleOverrides } };
  if (title !== undefined) key.title = title;
  plugin.draw(serialNumber, key, "draw");
}

// ---------------------------------------------------------------------------
// Git fallback for branch (when companion plugin isn't running)
// ---------------------------------------------------------------------------

function getGitBranch(projectPath) {
  return new Promise((resolve) => {
    if (!projectPath) { resolve(null); return; }
    exec(`git -C "${projectPath}" branch --show-current 2>/dev/null`, (err, stdout) => {
      resolve(err ? null : stdout.trim() || null);
    });
  });
}

async function refreshBranchFallback() {
  const branch = await getGitBranch(pluginConfig.projectPath || null);
  if (branch) {
    for (const port of activePorts()) {
      const ps = getPortState(port);
      if (!ps.branch) ps.branch = branch;
    }
  }
  updateAllKeys();
}

// ---------------------------------------------------------------------------
// Plugin events
// ---------------------------------------------------------------------------

plugin.on("plugin.config.updated", async (payload) => {
  pluginConfig = payload.config || {};
  await pollAllPorts();
  for (const port of activePorts()) {
    if (!getPortState(port).status) { await refreshBranchFallback(); break; }
  }
});

plugin.on("plugin.alive", async (payload) => {
  const { serialNumber, keys } = payload;
  logger.info("Alive:", serialNumber, keys.map((k) => k.cid));
  for (const key of keys) liveKeys[key.uid] = { ...key, serialNumber };

  await pollAllPorts();
  for (const port of activePorts()) {
    if (!getPortState(port).status) { await refreshBranchFallback(); break; }
  }
});

plugin.on("plugin.dead", (payload) => {
  for (const key of payload.keys) delete liveKeys[key.uid];
});

plugin.on("plugin.data", async (payload) => {
  const { data } = payload;
  const { key } = data;
  const port = keyPort(key);

  if (key.cid === "com.larvey.jetbrains.branch") {
    await pollPort(port);
    const ps = getPortState(port);
    if (!ps.status) await refreshBranchFallback();
    else updateAllKeys();
    return;
  }

  if (ACTION_CIDS.has(key.cid)) {
    await handleActionTap(key.cid, key);
    return;
  }

  // Stop / Build — poll if companion plugin isn't running on this port
  if (!getPortState(port).status) { pollPort(port).then(updateAllKeys); return; }
  await triggerAction(key.cid, key);
  setTimeout(() => pollPort(port).then(updateAllKeys), 1500);
});

plugin.on("system.actwin", async (payload) => {
  const name = payload?.newWin?.owner?.name ?? "";
  if (name.toLowerCase().includes("webstorm")) {
    await pollAllPorts();
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

plugin.start();

let lastPollTime = Date.now();
setInterval(() => {
  const now = Date.now();
  // If more than 20s elapsed the system was likely asleep — clear stale state immediately
  if (now - lastPollTime > 20_000) {
    for (const ps of Object.values(portState)) ps.status = null;
    updateAllKeys();
  }
  lastPollTime = now;
  pollAllPorts();
}, 10_000);
