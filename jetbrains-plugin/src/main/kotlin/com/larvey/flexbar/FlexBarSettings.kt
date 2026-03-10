package com.larvey.flexbar

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage

@Service(Service.Level.APP)
@State(name = "FlexBarSettings", storages = [Storage("flexbar.xml")])
class FlexBarSettings : PersistentStateComponent<FlexBarSettings.State> {

    data class State(@JvmField var port: Int = 7123)

    private var myState = State()

    override fun getState(): State = myState

    override fun loadState(state: State) {
        myState = state
    }

    var port: Int
        get() = myState.port
        set(value) { myState.port = value }

    companion object {
        fun getInstance(): FlexBarSettings =
            ApplicationManager.getApplication().getService(FlexBarSettings::class.java)
    }
}
