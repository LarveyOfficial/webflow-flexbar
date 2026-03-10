<template>
  <v-container>
    <v-row align="center">
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
        <v-btn block variant="tonal" :loading="loading" @click="checkConnection">
          Check
        </v-btn>
      </v-col>
    </v-row>

    <v-row v-if="!loading">
      <v-col cols="12">
        <v-alert
          :type="serverAvailable ? 'success' : 'warning'"
          density="compact"
          variant="tonal"
          class="mt-2"
        >
          {{ serverAvailable
            ? `Connected on port ${modelValue.data.port || 7123}`
            : `IDE companion not reachable on port ${modelValue.data.port || 7123}` }}
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
    return { loading: false, serverAvailable: false };
  },

  async mounted() {
    if (!this.modelValue.data.port) this.modelValue.data.port = 7123;
    await this.checkConnection();
  },

  methods: {
    async checkConnection() {
      this.loading = true;
      const port = this.modelValue.data.port || 7123;
      try {
        const res = await fetch(`http://127.0.0.1:${port}/ping`);
        const data = await res.json();
        this.serverAvailable = data?.ok === true;
      } catch {
        this.serverAvailable = false;
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped></style>
