# JetBrains IDE FlexBar Plugin — Project Instructions

## Architecture

Two components that communicate over HTTP:

1. **FlexBar plugin** (`src/plugin.js` → `com.larvey.jetbrains.plugin/backend/plugin.cjs`)
   - Node.js backend, built with Rollup
   - Connects to FlexDesigner via `@eniac/flexdesigner` WebSocket SDK
   - Calls `127.0.0.1:7123` (companion plugin); shows "Waiting for IDE" when unreachable

2. **IDE companion plugin** (`jetbrains-plugin/`)
   - Kotlin/IntelliJ Platform plugin
   - HTTP server on `127.0.0.1:7123`
   - Uses IntelliJ APIs to run/debug/stop/build and read git branch

## Key Files

| File | Purpose |
|------|---------|
| `src/plugin.js` | FlexBar plugin source (Node.js) |
| `com.larvey.jetbrains.plugin/manifest.json` | Plugin UUID `com.larvey.jetbrains`, key definitions |
| `com.larvey.jetbrains.plugin/ui/global_config.vue` | Config panel (Vue 3 + Vuetify) |
| `jetbrains-plugin/build.gradle.kts` | Kotlin build — local WebStorm by default, `wsVersion` property for CI |
| `jetbrains-plugin/src/main/kotlin/com/larvey/flexbar/FlexBarServer.kt` | HTTP server |
| `jetbrains-plugin/src/main/kotlin/com/larvey/flexbar/ActionExecutor.kt` | IDE action execution |
| `rollup.config.mjs` | Bundles `src/plugin.js` → `com.larvey.jetbrains.plugin/backend/plugin.cjs` |
| `.github/workflows/release.yml` | CI: builds both plugins and creates GitHub releases on version tags |

## Build Commands

### FlexBar plugin
```bash
npm run build          # production build
npm run dev            # watch + live-reload in FlexDesigner
npm run plugin:pack    # package as com.larvey.jetbrains.flexplugin
```

### IDE companion plugin
```bash
cd jetbrains-plugin
./gradlew buildPlugin                         # local (uses /Applications/WebStorm.app)
./gradlew buildPlugin -PwsVersion=2025.3 --no-configuration-cache  # CI (downloads WebStorm)
# Output: build/distributions/jetbrains-flexbar-plugin-1.0.0.zip
```

## Plugin IDs & CIDs

- FlexBar plugin UUID: `com.larvey.jetbrains`
- IDE companion plugin ID: `com.larvey.flexbar`
- Key CIDs: `com.larvey.jetbrains.{run,debug,stop,build,test,branch}`

## CI / Releases

Releasing is tag-driven. Pushing a `v*` tag triggers `.github/workflows/release.yml`:
1. Builds the FlexBar plugin (npm + zip → `com.larvey.jetbrains.flexplugin`)
2. Builds the IDE companion plugin (Gradle with `-PwsVersion=2025.3`)
3. Creates a GitHub Release with both artifacts attached

The `wsVersion` Gradle property switches the build from `local("/Applications/WebStorm.app")` to downloading the specified version — don't remove it.

## Notes

- Status polling interval: 10 seconds
- Double-tap logic: tapping Run/Debug/Test while running shows "stop?" for 1s
- Stop key turns bright red (`#e53935`) when any process is running
- `@eniac/flexdesigner` is bundled by Rollup; Node built-ins are external
- `buildSearchableOptions` is disabled in Gradle (speeds up build, not needed)
