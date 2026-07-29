import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Local default `/`. GitHub Pages CI sets VITE_BASE_PATH=/nika-leaderboard/
const base = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  plugins: [react()],
  base,
})
