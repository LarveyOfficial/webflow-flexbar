package com.larvey.flexbar

import com.intellij.execution.ExecutionManager
import com.intellij.execution.ProgramRunnerUtil
import com.intellij.execution.RunManager
import com.intellij.execution.RunnerAndConfigurationSettings
import com.intellij.execution.executors.DefaultDebugExecutor
import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManager
import com.intellij.openapi.wm.WindowManager
import com.intellij.task.ProjectTaskManager
import com.intellij.util.concurrency.AppExecutorUtil
import git4idea.repo.GitRepositoryManager
import java.util.concurrent.TimeUnit

object ActionExecutor {

    // -------------------------------------------------------------------------
    // Project resolution
    // -------------------------------------------------------------------------

    fun getActiveProject(): Project? {
        val projects = ProjectManager.getInstance().openProjects.filter { !it.isDisposed }
        if (projects.isEmpty()) return null
        val wm = WindowManager.getInstance()
        return projects.firstOrNull { wm.getFrame(it)?.isActive == true } ?: projects.first()
    }

    // -------------------------------------------------------------------------
    // Resolve a run configuration by name, falling back to the selected one
    // -------------------------------------------------------------------------

    private fun resolveConfig(project: Project, configName: String?): RunnerAndConfigurationSettings? {
        val rm = RunManager.getInstance(project)
        return if (!configName.isNullOrBlank()) {
            rm.allSettings.find { it.name == configName }
        } else {
            rm.selectedConfiguration
        }
    }

    // -------------------------------------------------------------------------
    // Actions
    // -------------------------------------------------------------------------

    fun run(configName: String? = null): Map<String, Any?> {
        val project = getActiveProject() ?: return error("No project open")
        val settings = resolveConfig(project, configName)
            ?: return error(if (configName != null) "Config '$configName' not found" else "No run configuration selected")

        val isRunning = isConfigRunning(project, settings.name)
        executeWithOptionalRestart(project, settings, DefaultRunExecutor.getRunExecutorInstance(), isRunning)
        return ok("config" to settings.name, "restarted" to isRunning)
    }

    fun debug(configName: String? = null): Map<String, Any?> {
        val project = getActiveProject() ?: return error("No project open")
        val settings = resolveConfig(project, configName)
            ?: return error(if (configName != null) "Config '$configName' not found" else "No run configuration selected")

        val isRunning = isConfigRunning(project, settings.name)
        executeWithOptionalRestart(project, settings, DefaultDebugExecutor.getDebugExecutorInstance(), isRunning)
        return ok("config" to settings.name, "restarted" to isRunning)
    }

    fun test(configName: String? = null): Map<String, Any?> {
        val project = getActiveProject() ?: return error("No project open")
        val settings = resolveConfig(project, configName)
            ?: return error(if (configName != null) "Config '$configName' not found" else "No run configuration selected")

        val isRunning = isConfigRunning(project, settings.name)
        executeWithOptionalRestart(project, settings, DefaultRunExecutor.getRunExecutorInstance(), isRunning)
        return ok("config" to settings.name, "restarted" to isRunning)
    }

    /**
     * Stop processes. If [configName] is given, only stops that specific config.
     * Otherwise stops everything (used by the dedicated Stop key).
     */
    fun stop(configName: String? = null): Map<String, Any?> {
        val project = getActiveProject() ?: return error("No project open")
        val all = ExecutionManager.getInstance(project).getRunningDescriptors { true }
        val targets = if (configName != null) all.filter { it.displayName == configName } else all
        val count = targets.size
        ApplicationManager.getApplication().invokeLater {
            targets.forEach { it.processHandler?.destroyProcess() }
        }
        return ok("stopped" to count)
    }

    fun build(): Map<String, Any?> {
        val project = getActiveProject() ?: return error("No project open")
        ApplicationManager.getApplication().invokeLater {
            ProjectTaskManager.getInstance(project).buildAllModules()
        }
        return ok()
    }

    // -------------------------------------------------------------------------
    // Config lists
    // -------------------------------------------------------------------------

    fun configs(): Map<String, Any?> {
        val project = getActiveProject()
            ?: return mapOf("configs" to emptyList<String>())
        val names = RunManager.getInstance(project).allSettings.map { it.name }
        return mapOf("configs" to names)
    }

    fun testConfigs(): Map<String, Any?> {
        val project = getActiveProject()
            ?: return mapOf("configs" to emptyList<String>())

        val all = RunManager.getInstance(project).allSettings
        val testKeywords = setOf("jest", "mocha", "karma", "vitest", "qunit", "jasmine", "cypress", "test", "spec")

        val filtered = all.filter { s ->
            val typeId = s.type.id.lowercase()
            val name   = s.name.lowercase()
            testKeywords.any { it in typeId } || testKeywords.any { it in name }
        }.map { it.name }

        // If nothing matched, return everything so the user isn't stuck
        return mapOf("configs" to filtered.ifEmpty { all.map { it.name } })
    }

    // -------------------------------------------------------------------------
    // Status — safe to call from HTTP server thread
    // -------------------------------------------------------------------------

    fun status(): Map<String, Any?> {
        val project = getActiveProject() ?: return mapOf(
            "project" to "", "projectPath" to "",
            "branch" to "",
            "running" to false, "runningConfigs" to emptyList<String>(),
            "selectedConfig" to ""
        )

        val branch = try {
            GitRepositoryManager.getInstance(project)
                .repositories.firstOrNull()?.currentBranch?.name ?: ""
        } catch (_: Exception) { "" }

        val em          = ExecutionManager.getInstance(project)
        val descriptors = em.getRunningDescriptors { true }
        val runningNames = descriptors.map { it.displayName }

        val selectedConfig = try {
            RunManager.getInstance(project).selectedConfiguration?.name ?: ""
        } catch (_: Exception) { "" }

        return mapOf(
            "project"        to project.name,
            "projectPath"    to (project.basePath ?: ""),
            "branch"         to branch,
            "running"        to runningNames.isNotEmpty(),
            "runningConfigs" to runningNames,
            "selectedConfig" to selectedConfig
        )
    }

    // -------------------------------------------------------------------------
    // Internals
    // -------------------------------------------------------------------------

    private fun isConfigRunning(project: Project, configName: String): Boolean =
        ExecutionManager.getInstance(project)
            .getRunningDescriptors { true }
            .any { it.displayName == configName }

    private fun executeWithOptionalRestart(
        project: Project,
        settings: RunnerAndConfigurationSettings,
        executor: com.intellij.execution.Executor,
        isRunning: Boolean
    ) {
        ApplicationManager.getApplication().invokeLater {
            if (isRunning) {
                // Stop all instances of this config, then rerun after a short delay
                ExecutionManager.getInstance(project)
                    .getRunningDescriptors { true }
                    .filter { it.displayName == settings.name }
                    .forEach { it.processHandler?.destroyProcess() }

                AppExecutorUtil.getAppScheduledExecutorService().schedule({
                    ApplicationManager.getApplication().invokeLater {
                        ProgramRunnerUtil.executeConfiguration(settings, executor)
                    }
                }, 800L, TimeUnit.MILLISECONDS)
            } else {
                ProgramRunnerUtil.executeConfiguration(settings, executor)
            }
        }
    }

    private fun ok(vararg extra: Pair<String, Any?>) = mapOf("ok" to true, *extra)
    private fun error(msg: String) = mapOf("ok" to false, "error" to msg)
}
