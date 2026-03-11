plugins {
    id("org.jetbrains.kotlin.jvm") version "2.2.0"
    id("org.jetbrains.intellij.platform") version "2.2.1"
}

group = "com.larvey.flexbar"
version = "1.0.8"

kotlin {
    jvmToolchain(21)
}

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    intellijPlatform {
        // Use a locally installed WebStorm by default.
        // Pass -PwsVersion=2024.3 to download a specific version instead (used in CI).
        val wsVersion = providers.gradleProperty("wsVersion").orNull
        if (wsVersion != null) {
            webstorm(wsVersion)
        } else {
            local("/Applications/WebStorm.app")
        }
        bundledPlugin("Git4Idea")
    }
}

tasks {
    buildSearchableOptions { enabled = false }
    instrumentCode { enabled = false }
}

intellijPlatform {
    pluginConfiguration {
        name = "FlexBar Integration"
        version = "1.0.8"
        description = """
            Exposes a local HTTP server on <b>localhost:7123</b> so the FlexBar
            hardware can directly control your JetBrains IDE: run, debug, stop,
            build, and display the current Git branch and run configuration.
        """.trimIndent()
        ideaVersion {
            sinceBuild = "241" // 2024.1
        }
    }
}
