const { plugin, logger } = require("@eniac/flexdesigner");
const { exec } = require("child_process");
const http = require("http");

// uid -> { ...key, serialNumber }
const liveKeys = {};
let pluginConfig = {};

// ---------------------------------------------------------------------------
// WebStorm HTTP API  (localhost:7123)
// ---------------------------------------------------------------------------

function callWebStorm(path, method = "POST") {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: "127.0.0.1", port: 7123, path, method, headers: { "Content-Length": "0" } },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
      }
    );
    req.setTimeout(2500, () => { req.destroy(); resolve(null); });
    req.on("error", () => resolve(null));
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Action dispatch — HTTP only
// ---------------------------------------------------------------------------

async function triggerAction(cid, keyData) {
  const configName = keyData?.configName || null;

  const basePaths = {
    "com.larvey.webstorm.run":   "/run",
    "com.larvey.webstorm.debug": "/debug",
    "com.larvey.webstorm.test":  "/test",
    "com.larvey.webstorm.stop":  "/stop",
    "com.larvey.webstorm.build": "/build",
  };
  const base = basePaths[cid];
  if (!base) return;

  const path = configName ? `${base}?config=${encodeURIComponent(configName)}` : base;
  const result = await callWebStorm(path, "POST");

  if (!result) {
    logger.warn(`HTTP ${path} failed — companion plugin not running`);
  } else if (result.error) {
    logger.warn(`IDE error for ${path}:`, result.error);
  }
}

// ---------------------------------------------------------------------------
// Double-tap-to-stop state
// uid -> { timer }  — set when the stop window is open after first tap
// ---------------------------------------------------------------------------

const stopWindows = {};

const ACTION_CIDS = new Set(["com.larvey.webstorm.run", "com.larvey.webstorm.debug", "com.larvey.webstorm.test"]);

async function handleActionTap(cid, key) {
  if (!cachedStatus) return; // companion plugin not running — do nothing

  const uid = key.uid;
  const configName = key.data?.configName || null;

  const base = { "com.larvey.webstorm.run": "/run", "com.larvey.webstorm.debug": "/debug", "com.larvey.webstorm.test": "/test" }[cid];
  const runPath = configName ? `${base}?config=${encodeURIComponent(configName)}` : base;

  // Not running → start immediately, no stop window needed
  const isRunning = configName
    ? (cachedStatus?.runningConfigs ?? []).includes(configName)
    : (cachedStatus?.running ?? false);

  if (!isRunning) {
    await callWebStorm(runPath, "POST");
    setTimeout(pollStatus, 1500);
    return;
  }

  // Already running — second tap within 1s stops, otherwise restarts
  if (stopWindows[uid]) {
    // Second tap → cancel pending restart, stop instead
    clearTimeout(stopWindows[uid].timer);
    delete stopWindows[uid];

    const stopPath = configName ? `/stop?config=${encodeURIComponent(configName)}` : "/stop";
    await callWebStorm(stopPath, "POST");
    setTimeout(pollStatus, 500);
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
      await callWebStorm(runPath, "POST");
      setTimeout(pollStatus, 1500);
    }, 1000),
  };
}

// ---------------------------------------------------------------------------
// Status polling & key drawing
// ---------------------------------------------------------------------------

let cachedStatus = null;
let cachedBranch = null;

async function pollStatus() {
  const status = await callWebStorm("/status", "GET");
  cachedStatus = status ?? null;
  if (status?.branch) cachedBranch = status.branch;
  updateAllKeys();
}

function updateAllKeys() {
  const connected = cachedStatus !== null;

  for (const info of Object.values(liveKeys)) {
    const sn = info.serialNumber;

    // Run / Debug buttons
    if (info.cid === "com.larvey.webstorm.run" || info.cid === "com.larvey.webstorm.debug") {
      if (!connected) {
        drawKey(sn, info, { bgColor: "#1a1a1a", showIcon: true, showTitle: true, title: "Waiting for IDE" });
        continue;
      }
      const configName = info.data?.configName || "";
      const isRunning  = configName
        ? (cachedStatus.runningConfigs ?? []).includes(configName)
        : (cachedStatus.running ?? false);

      const defaultLabel = info.cid === "com.larvey.webstorm.debug" ? "Debug" : "Run";
      const icon  = isRunning ? "mdi mdi-restart" : (info.cid === "com.larvey.webstorm.debug" ? "mdi mdi-bug" : "mdi mdi-play-circle");
      const label = configName ? (configName.length > 12 ? configName.slice(0, 11) + "…" : configName) : defaultLabel;

      drawKey(sn, info, { icon, title: label });
    }

    // Test button
    if (info.cid === "com.larvey.webstorm.test") {
      if (!connected) {
        drawKey(sn, info, { bgColor: "#1a1a1a", showIcon: true, showTitle: true, title: "Waiting for IDE" });
        continue;
      }
      const configName = info.data?.configName || "";
      const isRunning  = configName
        ? (cachedStatus.runningConfigs ?? []).includes(configName)
        : false;

      const icon  = isRunning ? "mdi mdi-restart" : "mdi mdi-test-tube";
      const label = configName ? (configName.length > 12 ? configName.slice(0, 11) + "…" : configName) : "Test";

      drawKey(sn, info, { icon, title: label });
    }

    // Stop button — bright red when anything is running, dark when idle, grey when disconnected
    if (info.cid === "com.larvey.webstorm.stop") {
      const bgColor = !connected ? "#1a1a1a" : (cachedStatus.running ? "#e53935" : "#4a1010");
      drawKey(sn, info, { bgColor });
    }

    // Build button — grey when disconnected
    if (info.cid === "com.larvey.webstorm.build") {
      if (!connected) drawKey(sn, info, { bgColor: "#1a1a1a" });
    }

    // Branch key — always draws from cachedBranch (updated by poll or git fallback)
    if (info.cid === "com.larvey.webstorm.branch") {
      const branch = cachedBranch || "no branch";
      drawKey(sn, info, { showIcon: true, showTitle: true, title: `  ${branch}` });
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
  if (branch) cachedBranch = branch;
  updateAllKeys();
}

// ---------------------------------------------------------------------------
// Plugin events
// ---------------------------------------------------------------------------

plugin.on("plugin.config.updated", async (payload) => {
  pluginConfig = payload.config || {};
  await pollStatus();
  if (!cachedStatus) await refreshBranchFallback();
});

plugin.on("plugin.alive", async (payload) => {
  const { serialNumber, keys } = payload;
  logger.info("Alive:", serialNumber, keys.map((k) => k.cid));
  for (const key of keys) liveKeys[key.uid] = { ...key, serialNumber };

  await pollStatus();
  if (!cachedStatus) await refreshBranchFallback();
});

plugin.on("plugin.dead", (payload) => {
  for (const key of payload.keys) delete liveKeys[key.uid];
});

plugin.on("plugin.data", async (payload) => {
  const { data } = payload;
  const { key } = data;

  if (key.cid === "com.larvey.webstorm.branch") {
    await pollStatus();
    if (!cachedStatus) await refreshBranchFallback();
    return;
  }

  if (ACTION_CIDS.has(key.cid)) {
    await handleActionTap(key.cid, key);
    return;
  }

  // Stop / Build — do nothing if companion plugin isn't running
  if (!cachedStatus) return;
  await triggerAction(key.cid, key.data);
  setTimeout(pollStatus, 1500);
});

plugin.on("system.actwin", async (payload) => {
  const name = payload?.newWin?.owner?.name ?? "";
  if (name.toLowerCase().includes("webstorm")) {
    await pollStatus();
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

plugin.start();

setInterval(pollStatus, 10_000);
