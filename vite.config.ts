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
  },
  test: {
    environment: 'jsdom',
  },
})
