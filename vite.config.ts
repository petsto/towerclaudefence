import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // three.js alone minifies to ~555 kB and can't be split further; everything else is ~110 kB.
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        // three in its own chunk: it changes far less often than game code, so it stays cached across deploys
        codeSplitting: {
          groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }],
        },
      },
    },
  },
});
