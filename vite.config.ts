/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Bind to IPv4 loopback: Windows firewall is blocking IPv6 (::1)
    // loopback connections, which broke the dev server (EACCES/ERR_CONNECTION_REFUSED).
    host: '127.0.0.1',
    // Fail loudly instead of silently drifting to 5174+ when 5173 is taken,
    // so the one-click launcher (start-dev.bat) can always rely on this URL.
    strictPort: true,
    // Automatically open the browser at the ready address (http://127.0.0.1:5173/)
    // once the dev server is up, so no manual `npm run dev` + URL typing is needed.
    open: true,
  },
  test: {
    environment: 'jsdom',
  },
})
