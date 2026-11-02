import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Preserve the Vite 5 JavaScript browser targets during the tooling upgrade.
  build: { target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'] },
  plugins: [
    react(),
    tailwindcss(),
  ],
})
