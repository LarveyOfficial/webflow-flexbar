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

    <v-row v-if="checked && !loading">
      <v-col cols="12">
        <v-alert
          :type="serverAvailable ? 'success' : 'warning'"
          density="compact"
          variant="tonal"
          class="mt-2"
        >
          {{ statusMessage }}
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
      loading: false,
      checked: false,
      serverAvailable: false,
      statusMessage: "",
    };
  },

  watch: {
    "modelValue.data.port"() {
      this.checked = false;
    },
  },

  mounted() {
    if (!this.modelValue.data.port) this.modelValue.data.port = 7123;
  },

  methods: {
    async checkAndReload() {
      this.loading = true;
      const port = this.modelValue.data.port || 7123;
      try {
        const res = await fetch(`http://127.0.0.1:${port}/ping`);
        const data = await res.json();
        this.serverAvailable = data?.ok === true;
        const ide = data?.ide || "IDE";
        this.statusMessage = this.serverAvailable
          ? `Connected to ${ide} on port ${port}`
          : `No IDE companion found on port ${port}`;
      } catch {
        this.serverAvailable = false;
        this.statusMessage = `No IDE companion found on port ${port}`;
      } finally {
        this.checked = true;
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped></style>
