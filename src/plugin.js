const { plugin, logger } = require("@eniac/flexdesigner");
const { exec, execFile } = require("child_process");
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

async function isWebStormPluginRunning() {
  const res = await callWebStorm("/ping", "GET");
  return res?.ok === true;
}

// ---------------------------------------------------------------------------
// AppleScript fallback
// ---------------------------------------------------------------------------

function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    execFile("osascript", ["-e", script], (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout.trim());
    });
  });
}

async function sendKeystrokeToWebStorm(keystroke) {
  try {
    await runAppleScript('tell application "WebStorm" to activate');
    await new Promise((r) => setTimeout(r, 150));
    await runAppleScript(
      `tell application "System Events"\ntell process "WebStorm"\n${keystroke}\nend tell\nend tell`
    );
  } catch (e) {
    logger.warn("AppleScript fallback failed:", e.message);
  }
}

const FALLBACK_KEYSTROKES = {
  "com.luis.webstorm.run":   'keystroke "r" using control down',
  "com.luis.webstorm.debug": 'keystroke "d" using control down',
  "com.luis.webstorm.stop":  "key code 120 using command down",
  "com.luis.webstorm.build": "key code 101 using command down",
  "com.luis.webstorm.test":  'keystroke "r" using {control down, shift down}',
};

// ---------------------------------------------------------------------------
// Action dispatch — always tries HTTP first, falls back to AppleScript
// ---------------------------------------------------------------------------

async function triggerAction(cid, keyData) {
  const configName = keyData?.configName || null;

  // Build the HTTP path with optional ?config= query param
  const basePaths = {
    "com.luis.webstorm.run":   "/run",
    "com.luis.webstorm.debug": "/debug",
    "com.luis.webstorm.test":  "/test",
    "com.luis.webstorm.stop":  "/stop",
    "com.luis.webstorm.build": "/build",
  };
  const base = basePaths[cid];
  if (!base) return;

  const path = configName ? `${base}?config=${encodeURIComponent(configName)}` : base;
  const result = await callWebStorm(path, "POST");

  if (!result) {
    logger.warn(`HTTP ${path} unavailable — falling back to AppleScript`);
    const keystroke = FALLBACK_KEYSTROKES[cid];
    if (keystroke) await sendKeystrokeToWebStorm(keystroke);
  } else if (result.error) {
    logger.warn(`WebStorm error for ${path}:`, result.error);
  }
}

// ---------------------------------------------------------------------------
// Double-tap-to-stop state
// uid -> { timer }  — set when the stop window is open after first tap
// ---------------------------------------------------------------------------

const stopWindows = {};

const ACTION_CIDS = new Set(["com.luis.webstorm.run", "com.luis.webstorm.debug", "com.luis.webstorm.test"]);

async function handleActionTap(cid, key) {
  const uid = key.uid;
  const configName = key.data?.configName || null;

  const base = { "com.luis.webstorm.run": "/run", "com.luis.webstorm.debug": "/debug", "com.luis.webstorm.test": "/test" }[cid];
  const runPath = configName ? `${base}?config=${encodeURIComponent(configName)}` : base;

  // Not running → start immediately, no stop window needed
  const isRunning = configName
    ? (cachedStatus?.runningConfigs ?? []).includes(configName)
    : (cachedStatus?.running ?? false);

  if (!isRunning) {
    const result = await callWebStorm(runPath, "POST");
    if (!result) {
      const keystroke = FALLBACK_KEYSTROKES[cid];
      if (keystroke) await sendKeystrokeToWebStorm(keystroke);
    }
    setTimeout(pollStatus, 1500);
    return;
  }

  // Already running — second tap within 1s stops, otherwise restarts
  if (stopWindows[uid]) {
    // Second tap → cancel pending restart, stop instead
    clearTimeout(stopWindows[uid].timer);
    delete stopWindows[uid];

    const stopPath = configName ? `/stop?config=${encodeURIComponent(configName)}` : "/stop";
    const result = await callWebStorm(stopPath, "POST");
    if (!result) {
      const keystroke = FALLBACK_KEYSTROKES["com.luis.webstorm.stop"];
      if (keystroke) await sendKeystrokeToWebStorm(keystroke);
    }
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
      // No second tap — go ahead and restart
      const result = await callWebStorm(runPath, "POST");
      if (!result) {
        const keystroke = FALLBACK_KEYSTROKES[cid];
        if (keystroke) await sendKeystrokeToWebStorm(keystroke);
      }
      setTimeout(pollStatus, 1500);
    }, 1000),
  };
}

// ---------------------------------------------------------------------------
// Status polling & key drawing
// ---------------------------------------------------------------------------

let cachedStatus = null;

async function pollStatus() {
  const status = await callWebStorm("/status", "GET");
  cachedStatus = status ?? null;
  updateAllKeys();
}

function updateAllKeys() {
  for (const info of Object.values(liveKeys)) {
    const sn = info.serialNumber;

    // Run button — show config name as label; reload icon when that config is running
    if (info.cid === "com.luis.webstorm.run" || info.cid === "com.luis.webstorm.debug") {
      const configName = info.data?.configName || "";
      const isRunning  = configName
        ? (cachedStatus?.runningConfigs ?? []).includes(configName)
        : (cachedStatus?.running ?? false);

      const defaultLabel = info.cid === "com.luis.webstorm.debug" ? "Debug" : "Run";
      const icon  = isRunning ? "mdi mdi-restart" : (info.cid === "com.luis.webstorm.debug" ? "mdi mdi-bug" : "mdi mdi-play-circle");
      const label = configName ? (configName.length > 12 ? configName.slice(0, 11) + "…" : configName) : defaultLabel;

      drawKey(sn, info, { icon, title: label });
    }

    // Test button — same pattern
    if (info.cid === "com.luis.webstorm.test") {
      const configName = info.data?.configName || "";
      const isRunning  = configName
        ? (cachedStatus?.runningConfigs ?? []).includes(configName)
        : false;

      const icon  = isRunning ? "mdi mdi-restart" : "mdi mdi-test-tube";
      const label = configName ? (configName.length > 12 ? configName.slice(0, 11) + "…" : configName) : "Test";

      drawKey(sn, info, { icon, title: label });
    }

    // Stop button — bright red when anything is running
    if (info.cid === "com.luis.webstorm.stop") {
      const isRunning = cachedStatus?.running ?? false;
      drawKey(sn, info, { bgColor: isRunning ? "#e53935" : "#4a1010" });
    }

    // Branch key
    if (info.cid === "com.luis.webstorm.branch") {
      const branch = cachedStatus?.branch || "no branch";
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
  for (const info of Object.values(liveKeys)) {
    if (info.cid === "com.luis.webstorm.branch") {
      drawKey(info.serialNumber, info, {
        showIcon: true, showTitle: true,
        title: branch ? `  ${branch}` : "no branch",
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Plugin events
// ---------------------------------------------------------------------------

plugin.on("plugin.config.updated", async (payload) => {
  pluginConfig = payload.config || {};
  const alive = await isWebStormPluginRunning();
  alive ? pollStatus() : refreshBranchFallback();
});

plugin.on("plugin.alive", async (payload) => {
  const { serialNumber, keys } = payload;
  logger.info("Alive:", serialNumber, keys.map((k) => k.cid));
  for (const key of keys) liveKeys[key.uid] = { ...key, serialNumber };

  const alive = await isWebStormPluginRunning();
  alive ? await pollStatus() : await refreshBranchFallback();
});

plugin.on("plugin.dead", (payload) => {
  for (const key of payload.keys) delete liveKeys[key.uid];
});

plugin.on("plugin.data", async (payload) => {
  const { data } = payload;
  const { key } = data;

  if (key.cid === "com.luis.webstorm.branch") {
    const alive = await isWebStormPluginRunning();
    alive ? await pollStatus() : await refreshBranchFallback();
    return;
  }

  if (ACTION_CIDS.has(key.cid)) {
    await handleActionTap(key.cid, key);
    return;
  }

  // Stop / Build — straight through
  await triggerAction(key.cid, key.data);
  setTimeout(pollStatus, 1500);
});

plugin.on("system.actwin", async (payload) => {
  const name = payload?.newWin?.owner?.name ?? "";
  if (name.toLowerCase().includes("webstorm")) {
    const alive = await isWebStormPluginRunning();
    if (alive) await pollStatus();
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

plugin.start();

setInterval(pollStatus, 10_000);
