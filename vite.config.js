import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Explicitly declare the build output folder.
  // Vercel looks for 'dist/' by default — this must match outputDirectory in vercel.json
  build: {
    outDir: 'dist',
    // Generates a manifest so Vercel can fingerprint and cache assets correctly
    manifest: true,
  },
  server: {
    port: 3000,
  },
})
