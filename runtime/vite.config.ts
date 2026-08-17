import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    ssr: 'runtime/server/index.ts',
    outDir: 'runtime-dist',
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'server.js', format: 'es' } },
  },
})
