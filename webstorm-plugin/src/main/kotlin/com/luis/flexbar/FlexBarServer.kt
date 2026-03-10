package com.luis.flexbar

import com.intellij.openapi.diagnostic.Logger
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.net.URLDecoder
import java.util.concurrent.Executors

object FlexBarServer {

    private val LOG = Logger.getInstance(FlexBarServer::class.java)
    const val PORT = 7123

    @Volatile private var started = false
    private var server: HttpServer? = null

    @Synchronized
    fun startIfNeeded() {
        if (started) return
        try {
            server = HttpServer.create(InetSocketAddress("127.0.0.1", PORT), 16).apply {
                // Actions — POST, optional ?config= query param
                createContext("/run")   { ex -> handlePost(ex) { ActionExecutor.run(queryParam(ex, "config")) } }
                createContext("/debug") { ex -> handlePost(ex) { ActionExecutor.debug(queryParam(ex, "config")) } }
                createContext("/test")  { ex -> handlePost(ex) { ActionExecutor.test(queryParam(ex, "config")) } }
                createContext("/stop")  { ex -> handlePost(ex) { ActionExecutor.stop(queryParam(ex, "config")) } }
                createContext("/build") { ex -> handlePost(ex) { ActionExecutor.build() } }

                // Read-only — GET
                createContext("/status")       { ex -> handleGet(ex) { ActionExecutor.status() } }
                createContext("/configs")      { ex -> handleGet(ex) { ActionExecutor.configs() } }
                createContext("/test-configs") { ex -> handleGet(ex) { ActionExecutor.testConfigs() } }
                createContext("/ping")         { ex -> respond(ex, 200, mapOf("ok" to true, "port" to PORT)) }

                executor = Executors.newCachedThreadPool()
                start()
            }
            started = true
            LOG.info("FlexBar HTTP server listening on 127.0.0.1:$PORT")
            Runtime.getRuntime().addShutdownHook(Thread { stop() })
        } catch (e: Exception) {
            LOG.error("FlexBar HTTP server failed to start on port $PORT", e)
        }
    }

    fun stop() {
        server?.stop(0)
        started = false
    }

    // -------------------------------------------------------------------------
    // Request handling
    // -------------------------------------------------------------------------

    private fun handlePost(ex: HttpExchange, action: () -> Map<String, Any?>) {
        if (ex.requestMethod != "POST") { respond(ex, 405, mapOf("error" to "POST required")); return }
        ex.requestBody.use { it.readBytes() }
        respond(ex, 200, runCatching(action).getOrElse { mapOf("error" to it.message) })
    }

    private fun handleGet(ex: HttpExchange, action: () -> Map<String, Any?>) {
        respond(ex, 200, runCatching(action).getOrElse { mapOf("error" to it.message) })
    }

    private fun respond(ex: HttpExchange, code: Int, data: Map<String, Any?>) {
        val bytes = toJson(data).toByteArray(Charsets.UTF_8)
        with(ex.responseHeaders) {
            set("Content-Type", "application/json; charset=utf-8")
            set("Access-Control-Allow-Origin", "*")
        }
        ex.sendResponseHeaders(code, bytes.size.toLong())
        ex.responseBody.use { it.write(bytes) }
    }

    private fun queryParam(ex: HttpExchange, name: String): String? =
        ex.requestURI.query
            ?.split("&")
            ?.mapNotNull { part ->
                val kv = part.split("=", limit = 2)
                if (kv.size == 2 && kv[0] == name) URLDecoder.decode(kv[1], "UTF-8") else null
            }
            ?.firstOrNull()
            ?.takeIf { it.isNotBlank() }

    // -------------------------------------------------------------------------
    // JSON serialiser — handles String, Boolean, Number, List, Map
    // -------------------------------------------------------------------------

    private fun toJson(map: Map<String, Any?>): String = buildString {
        append('{')
        map.entries.forEachIndexed { i, (k, v) ->
            if (i > 0) append(',')
            append('"').append(k).append("\":")
            appendValue(v)
        }
        append('}')
    }

    private fun StringBuilder.appendValue(v: Any?) {
        when (v) {
            null         -> append("null")
            is Boolean   -> append(v)
            is Number    -> append(v)
            is String    -> append('"').append(v.replace("\\", "\\\\").replace("\"", "\\\"")).append('"')
            is List<*>   -> {
                append('[')
                v.forEachIndexed { i, item -> if (i > 0) append(','); appendValue(item) }
                append(']')
            }
            is Map<*, *> -> {
                append('{')
                v.entries.forEachIndexed { i, (mk, mv) ->
                    if (i > 0) append(',')
                    append('"').append(mk).append("\":")
                    appendValue(mv)
                }
                append('}')
            }
            else         -> append('"').append(v.toString().replace("\"", "\\\"")).append('"')
        }
    }
}
