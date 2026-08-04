import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Separate from vite.config.js on purpose: the app config loads the Tailwind
// plugin, which does real CSS work that tests neither need nor should pay for.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    // Only our own tests — node_modules ships plenty of *.test.js.
    include: ['src/**/*.test.{js,jsx}'],
  },
})
