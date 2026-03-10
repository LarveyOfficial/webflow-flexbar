<template>
  <v-container>
    <v-row align="center" class="mb-1">
      <v-col cols="8">
        <v-text-field
          v-model.number="modelValue.data.port"
          label="Companion Port"
          type="number"
          min="1"
          max="65535"
          prepend-inner-icon="mdi-lan-connect"
          hide-details
          density="compact"
        />
      </v-col>
      <v-col cols="4">
        <v-btn block variant="tonal" :loading="loading" @click="checkAndReload">
          Check
        </v-btn>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12">
        <v-select
          v-model="modelValue.data.configName"
          :items="configs"
          item-title="title"
          item-value="value"
          label="Run Configuration"
          outlined
          hide-details="auto"
          :loading="loading"
          :disabled="!serverAvailable"
          prepend-inner-icon="mdi-cog-play-outline"
        />
      </v-col>

      <v-col v-if="!serverAvailable && !loading" cols="12">
        <v-alert type="warning" density="compact" variant="tonal" class="mt-2">
          IDE companion plugin not reachable on port {{ modelValue.data.port || 7123 }}.
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

  async mounted() {
    if (!this.modelValue.data.port) this.modelValue.data.port = 7123;
    await this.checkAndReload();
  },

  methods: {
    async checkAndReload() {
      this.loading = true;
      const port = this.modelValue.data.port || 7123;
      try {
        const res = await fetch(`http://127.0.0.1:${port}/configs`);
        const data = await res.json();
        const names = data.configs ?? [];
        this.configs = [
          { title: "Current configuration", value: "" },
          ...names.map((n) => ({ title: n, value: n })),
        ];
        this.serverAvailable = true;
      } catch {
        this.configs = [];
        this.serverAvailable = false;
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped></style>
