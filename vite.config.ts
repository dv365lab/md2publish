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
    // Use an uncommon fixed port to avoid conflicts with other local apps.
    port: 43187,
    // Fail loudly instead of silently drifting to another port when this one is taken,
    // so both one-click launchers can always rely on this URL.
    strictPort: true,
    // Automatically open the browser at the ready address (http://127.0.0.1:43187/)
    // once the dev server is up, so no manual `npm run dev` + URL typing is needed.
    open: true,
  },
  test: {
    environment: 'jsdom',
  },
})
