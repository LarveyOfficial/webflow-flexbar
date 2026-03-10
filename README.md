# JetBrains IDE FlexBar Plugin

Control your JetBrains IDE from your [FlexBar](https://www.flexbar.app/) hardware device — run, debug, stop, build, test, and display the current git branch on dedicated keys.

> **Note:** This plugin has only been tested with WebStorm. It should work with other JetBrains IDEs (IntelliJ IDEA, GoLand, PyCharm, etc.) since it only uses platform-level APIs, but this is not officially verified.

## Architecture

The project has two components that work together:

```
FlexBar device
     │
     │  FlexDesigner SDK (WebSocket)
     ▼
Node.js plugin (src/plugin.js)
     │
     │  HTTP to localhost:<port>
     ▼
IDE companion plugin (jetbrains-plugin/)
     │
     │  IntelliJ Platform APIs
     ▼
JetBrains IDE
```

### FlexBar Plugin (`com.larvey.jetbrains.plugin/`)

A Node.js backend built with the `@eniac/flexdesigner` SDK. Communicates with FlexDesigner over WebSocket, polls each IDE companion plugin every 10 seconds, and updates key displays based on IDE state. Keys show **"Waiting for IDE"** when the companion plugin is unreachable.

Each FlexBar key stores its own port number, allowing different keys to target different IDE instances running simultaneously.

### IDE Companion Plugin (`jetbrains-plugin/`)

A Kotlin/IntelliJ Platform plugin that exposes an HTTP server on `127.0.0.1` (default port `7123`). It uses IntelliJ APIs to execute run configurations, query status, and read git branch information. The port is configurable via **Settings → Tools → FlexBar Integration**.

## Keys

| Key | CID | Action | Color |
|-----|-----|--------|-------|
| Run | `com.larvey.jetbrains.run` | Run the selected configuration | Green `#2d6a4f` |
| Debug | `com.larvey.jetbrains.debug` | Debug the selected configuration | Orange `#b5500b` |
| Stop | `com.larvey.jetbrains.stop` | Stop all running processes (turns bright red when active) | Red `#c62828` |
| Build | `com.larvey.jetbrains.build` | Build project | Blue `#1565c0` |
| Test | `com.larvey.jetbrains.test` | Run test configuration | Purple `#6a1b9a` |
| Branch | `com.larvey.jetbrains.branch` | Displays current git branch (tap to refresh) | Navy `#1e1e2e` |

Run, Debug, and Test keys show the selected configuration name as their label and display a restart icon when a process is running. Tapping Run/Debug/Test while a process is running shows a "stop?" prompt for 1 second — a second tap stops it, otherwise it restarts.

Every key has a **Companion Port** field in its config panel (default `7123`). Set different ports on different keys to control multiple IDE instances at once.

## Multiple IDE Instances

To run keys against different IDEs simultaneously:

1. In each IDE, go to **Settings → Tools → FlexBar Integration** and set a unique port (e.g. `7123`, `7124`).
2. In each FlexBar key's config panel, enter the matching port and click **Check** to verify the connection and reload available configurations.

## Prerequisites

- [FlexDesigner](https://www.flexbar.app/) installed
- A JetBrains IDE (2024.1+) with the companion plugin installed
- Node.js 20+ and npm (for building the FlexBar plugin)
- Java 21+ (for building the companion plugin)

## Installation

### 1. Install the IDE companion plugin

Download `jetbrains-flexbar-plugin-*.zip` from the [latest release](../../releases/latest) and install it in your JetBrains IDE:

> **Settings → Plugins → ⚙ gear icon → Install Plugin from Disk…**

Restart the IDE. The plugin starts an HTTP server on `localhost:7123` automatically on startup. To change the port go to **Settings → Tools → FlexBar Integration**.

### 2. Install the FlexBar plugin

Download `com.larvey.jetbrains.flexplugin` from the [latest release](../../releases/latest) and install it in FlexDesigner:

> **FlexDesigner → Plugins → Install from File**

### 3. Configure (optional)

Open the FlexBar plugin settings in FlexDesigner. Set your project path if you want the Branch key to fall back to reading the current branch via git CLI when the companion plugin is unreachable.

## Development

### FlexBar plugin

```bash
npm install

# Build once
npm run build

# Watch + live-reload in FlexDesigner
npm run dev

# Package as .flexplugin
npm run plugin:pack
```

The build compiles `src/plugin.js` through Rollup into `com.larvey.jetbrains.plugin/backend/plugin.cjs`.

### IDE companion plugin

```bash
cd jetbrains-plugin

# Build (uses /Applications/WebStorm.app locally — no download)
./gradlew buildPlugin --no-configuration-cache

# Output
build/distributions/jetbrains-flexbar-plugin-1.0.0.zip
```

Install the zip via **Settings → Plugins → ⚙ → Install Plugin from Disk**.

## HTTP API (companion plugin)

The companion plugin exposes these endpoints on `127.0.0.1:<port>` (default `7123`):

| Method | Path | Description |
|--------|------|-------------|
| GET | `/ping` | Health check — `{"ok": true, "port": 7123}` |
| GET | `/status` | Project name, branch, running state, selected config |
| GET | `/configs` | List all run configurations |
| GET | `/test-configs` | List test-like configurations |
| POST | `/run[?config=name]` | Run a configuration |
| POST | `/debug[?config=name]` | Debug a configuration |
| POST | `/test[?config=name]` | Run a test configuration |
| POST | `/stop[?config=name]` | Stop running process(es) |
| POST | `/build` | Build all modules |

## Project Structure

```
FlexBar/
├── src/
│   └── plugin.js                    # FlexBar plugin source
├── com.larvey.jetbrains.plugin/     # FlexBar plugin package
│   ├── manifest.json                # Plugin metadata & key definitions
│   ├── config.json                  # Default config
│   ├── backend/plugin.cjs           # Compiled output (rollup)
│   └── ui/                          # Vue 3 config panels
│       ├── global_config.vue
│       ├── run.vue / debug.vue / test.vue
│       ├── stop.vue / build.vue / branch.vue
│       └── config_picker.vue
├── jetbrains-plugin/                # IntelliJ Platform companion plugin
│   ├── build.gradle.kts
│   └── src/main/kotlin/com/larvey/flexbar/
│       ├── FlexBarServer.kt         # HTTP server (configurable port)
│       ├── FlexBarSettings.kt       # Persistent port setting
│       ├── FlexBarConfigurable.kt   # Settings UI (Tools → FlexBar Integration)
│       ├── ActionExecutor.kt        # IDE action execution
│       └── FlexBarStartupActivity.kt
├── rollup.config.mjs
└── package.json
```
