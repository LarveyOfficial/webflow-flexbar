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
          {{ serverAvailable
            ? `Connected to ${ideName || 'IDE'} on port ${modelValue.data.port || 7123}`
            : `No IDE companion found on port ${modelValue.data.port || 7123}` }}
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
      ideName: "",
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
        this.ideName = data?.ide || "";
      } catch {
        this.serverAvailable = false;
      } finally {
        this.checked = true;
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped></style>
