import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    ssr: true,
    target: 'node20',
    outDir: 'scripts/.verify-dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'scripts/verify-seed-equalize.ts',
      output: { format: 'esm', entryFileNames: 'verify.mjs' },
    },
  },
  ssr: { noExternal: false },
});
