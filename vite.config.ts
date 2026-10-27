/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['jszip', 'html2canvas-pro', 'highlight.js/lib/core'],
  },
  server: {
    // Bind to IPv4 loopback: Windows firewall is blocking IPv6 (::1)
    // loopback connections, which broke the dev server (EACCES/ERR_CONNECTION_REFUSED).
    host: '127.0.0.1',
    // Prefer this uncommon port, but automatically try the next available one
    // when another process is already using it.
    port: 43187,
    strictPort: false,
    // Vite opens the actual ready URL, including an automatically selected port.
    open: true,
  },
  test: {
    environment: 'jsdom',
  },
})
