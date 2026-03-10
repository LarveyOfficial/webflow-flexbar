# WebStorm FlexBar Plugin

Control WebStorm from your [FlexBar](https://www.flexbar.app/) hardware device — run, debug, stop, build, test, and display the current git branch on dedicated keys.

## Architecture

The project has two components that work together:

```
FlexBar device
     │
     │  FlexDesigner SDK (WebSocket)
     ▼
Node.js plugin (src/plugin.js)
     │
     │  HTTP to localhost:7123 (primary)
     │  AppleScript fallback (if server unreachable)
     ▼
WebStorm companion plugin (webstorm-plugin/)
     │
     │  IntelliJ Platform APIs
     ▼
WebStorm IDE
```

### FlexBar Plugin (`com.larvey.webstorm.plugin/`)

A Node.js backend built with the `@eniac/flexdesigner` SDK. Communicates with FlexDesigner over WebSocket, polls the WebStorm companion plugin every 10 seconds, and updates key displays based on IDE state. Falls back to AppleScript keystrokes if the companion plugin is unreachable.

### WebStorm Companion Plugin (`webstorm-plugin/`)

A Kotlin/IntelliJ Platform plugin that exposes an HTTP server on `127.0.0.1:7123`. It uses IntelliJ APIs to execute run configurations, query status, and read git branch information.

## Keys

| Key | CID | Action | Color |
|-----|-----|--------|-------|
| Run | `com.larvey.webstorm.run` | Run the selected configuration | Green `#2d6a4f` |
| Debug | `com.larvey.webstorm.debug` | Debug the selected configuration | Orange `#b5500b` |
| Stop | `com.larvey.webstorm.stop` | Stop running process (turns bright red when active) | Red `#c62828` |
| Build | `com.larvey.webstorm.build` | Build project | Blue `#1565c0` |
| Test | `com.larvey.webstorm.test` | Run test configuration | Purple `#6a1b9a` |
| Branch | `com.larvey.webstorm.branch` | Displays current git branch (tap to refresh) | Navy `#1e1e2e` |

Run, Debug, and Test keys show the selected configuration name as their label and display a restart icon when a process is running. Tapping Run/Debug/Test while a process is running shows a "stop?" prompt for 1 second — a second tap stops it, otherwise it restarts.

## Prerequisites

- macOS 10.15+ (AppleScript fallback requires macOS)
- [FlexDesigner](https://www.flexbar.app/) installed
- [WebStorm](https://www.jetbrains.com/webstorm/) 2024.1+
- Node.js 20+ and npm (for building the FlexBar plugin)
- Java 21+ (for building the WebStorm companion plugin)

## Installation

### 1. Install the WebStorm companion plugin

Download `webstorm-flexbar-plugin-*.zip` from the [latest release](../../releases/latest) and install it in WebStorm:

> **Settings → Plugins → ⚙ gear icon → Install Plugin from Disk…**

Restart WebStorm. The plugin starts an HTTP server on `localhost:7123` automatically on startup.

### 2. Install the FlexBar plugin

Download `com.larvey.webstorm.flexplugin` from the [latest release](../../releases/latest) and install it in FlexDesigner:

> **FlexDesigner → Plugins → Install from File**

### 3. Configure (optional)

Open the FlexBar plugin settings in FlexDesigner. If you are not using the WebStorm companion plugin, set your project path here so the Branch key can still read the current branch via git CLI.

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

The build compiles `src/plugin.js` through Rollup into `com.larvey.webstorm.plugin/backend/plugin.cjs`.

### WebStorm companion plugin

```bash
cd webstorm-plugin

# Build (uses /Applications/WebStorm.app locally — no download)
./gradlew buildPlugin

# Output
build/distributions/webstorm-flexbar-plugin-1.0.0.zip
```

Install the zip in WebStorm via **Settings → Plugins → ⚙ → Install Plugin from Disk**.

## HTTP API (companion plugin)

The companion plugin exposes these endpoints on `127.0.0.1:7123`:

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
│   └── plugin.js                  # FlexBar plugin source
├── com.larvey.webstorm.plugin/    # FlexBar plugin package
│   ├── manifest.json              # Plugin metadata & key definitions
│   ├── config.json                # Default config
│   ├── backend/plugin.cjs         # Compiled output (rollup)
│   └── ui/                        # Vue 3 config panels
│       ├── global_config.vue
│       ├── run.vue / debug.vue / test.vue
│       └── config_picker.vue
├── webstorm-plugin/               # IntelliJ Platform companion plugin
│   ├── build.gradle.kts
│   └── src/main/kotlin/com/larvey/flexbar/
│       ├── FlexBarServer.kt       # HTTP server
│       ├── ActionExecutor.kt      # IDE action execution
│       └── FlexBarStartupActivity.kt
├── rollup.config.mjs
└── package.json
```
