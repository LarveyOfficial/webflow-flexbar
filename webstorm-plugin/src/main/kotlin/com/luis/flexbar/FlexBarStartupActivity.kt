package com.luis.flexbar

import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity

/**
 * Triggered once per project open. Starts the HTTP server on the first call;
 * subsequent project opens are no-ops (the server is app-level).
 */
class FlexBarStartupActivity : StartupActivity.DumbAware {
    override fun runActivity(project: Project) {
        FlexBarServer.startIfNeeded()
    }
}
