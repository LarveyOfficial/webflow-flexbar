<template>
  <v-container>
    <v-row>
      <v-col cols="12">
        <v-select
          v-model="modelValue.data.configName"
          :items="configs"
          :label="label"
          placeholder="Use currently selected config"
          clearable
          outlined
          hide-details="auto"
          :loading="loading"
          :disabled="!serverAvailable"
          prepend-inner-icon="mdi-cog-play-outline"
        />
      </v-col>

      <v-col v-if="!serverAvailable" cols="12">
        <v-alert type="warning" density="compact" variant="tonal" class="mt-2">
          WebStorm companion plugin not reachable. Open WebStorm first, then reopen this panel.
        </v-alert>
      </v-col>

      <v-col v-if="serverAvailable && configs.length === 0 && !loading" cols="12">
        <v-alert type="info" density="compact" variant="tonal" class="mt-2">
          No configurations found in the open project.
        </v-alert>
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
export default {
  props: {
    modelValue: { type: Object, required: true },
  },
  emits: ["update:modelValue"],

  data() {
    return {
      configs: [],
      loading: false,
      serverAvailable: false,
    };
  },

  computed: {
    // The manifest cid tells us whether this is a test key or a run/debug key.
    isTestKey() {
      return this.modelValue?.cid?.includes("test");
    },
    label() {
      return this.isTestKey ? "Test Configuration" : "Run Configuration";
    },
  },

  async mounted() {
    this.loading = true;
    const endpoint = this.isTestKey
      ? "http://127.0.0.1:7123/test-configs"
      : "http://127.0.0.1:7123/configs";
    try {
      const res = await fetch(endpoint);
      const data = await res.json();
      this.configs = data.configs ?? [];
      this.serverAvailable = true;
    } catch {
      this.serverAvailable = false;
    } finally {
      this.loading = false;
    }
  },
};
</script>

<style scoped></style>
