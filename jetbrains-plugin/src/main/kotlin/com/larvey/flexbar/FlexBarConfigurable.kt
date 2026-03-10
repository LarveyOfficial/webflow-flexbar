package com.larvey.flexbar

import com.intellij.openapi.options.Configurable
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBTextField
import com.intellij.util.ui.FormBuilder
import javax.swing.JComponent
import javax.swing.JPanel

class FlexBarConfigurable : Configurable {

    private var portField: JBTextField? = null

    override fun getDisplayName() = "FlexBar Integration"

    override fun createComponent(): JComponent {
        portField = JBTextField(FlexBarSettings.getInstance().port.toString(), 6)
        return FormBuilder.createFormBuilder()
            .addLabeledComponent(JBLabel("HTTP server port:"), portField!!, 1, false)
            .addComponentFillVertically(JPanel(), 0)
            .panel
    }

    override fun isModified(): Boolean {
        val saved = FlexBarSettings.getInstance().port
        return portField?.text?.toIntOrNull() != saved
    }

    override fun apply() {
        val newPort = portField?.text?.toIntOrNull()?.takeIf { it in 1..65535 } ?: 7123
        val settings = FlexBarSettings.getInstance()
        if (newPort != settings.port) {
            settings.port = newPort
            FlexBarServer.restart()
        }
    }

    override fun reset() {
        portField?.text = FlexBarSettings.getInstance().port.toString()
    }

    override fun disposeUIResources() {
        portField = null
    }
}
