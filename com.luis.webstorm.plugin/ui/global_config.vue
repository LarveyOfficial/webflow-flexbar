<template>
  <v-container>
    <!-- Companion plugin status -->
    <v-alert
      :type="connected ? 'success' : 'warning'"
      :icon="connected ? 'mdi-check-circle' : 'mdi-alert-circle-outline'"
      class="mb-4"
      density="compact"
      variant="tonal"
    >
      <template v-if="connected">
        WebStorm companion plugin connected — direct API active.
      </template>
      <template v-else>
        WebStorm companion plugin not detected. Install it in WebStorm and actions
        will use the direct API; for now, AppleScript shortcuts are used as a fallback.
      </template>
    </v-alert>

    <v-card prepend-icon="mdi-code-braces" title="WebStorm Plugin Settings">
      <v-card-text>
        <v-row>
          <v-col cols="12">
            <v-text-field
              v-model="modelValue.config.projectPath"
              label="Project Path (fallback)"
              hint="Used for the Git Branch key only when the companion plugin is not running. Leave blank if the companion plugin is installed."
              persistent-hint
              prepend-inner-icon="mdi-folder-open"
              outlined
              hide-details="auto"
            />
          </v-col>
        </v-row>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" icon @click="checkConnection" title="Test connection">
          <v-icon>mdi-refresh</v-icon>
        </v-btn>
        <v-btn variant="text" icon @click="saveConfig" title="Save settings">
          <v-icon>mdi-check-circle-outline</v-icon>
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-container>
</template>

<script>
export default {
  props: {
    modelValue: { type: Object, required: true },
  },

  data() {
    return { connected: false };
  },

  async mounted() {
    await this.checkConnection();
  },

  methods: {
    async checkConnection() {
      try {
        const res = await fetch("http://127.0.0.1:7123/ping");
        const json = await res.json();
        this.connected = json?.ok === true;
      } catch {
        this.connected = false;
      }
    },

    saveConfig() {
      this.$fd.setConfig(this.modelValue.config);
      this.$fd.showSnackbarMessage("success", "Settings saved!");
    },
  },
};
</script>

<style scoped></style>
