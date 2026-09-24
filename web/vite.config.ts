import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Local default `/`. CI sets VITE_BASE_PATH=/nika/leaderboard/ (hosted under sands-lab/nika gh-pages)
const base = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  plugins: [react()],
  base,
})
