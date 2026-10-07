import react from '@vitejs/plugin-react'
import { defineConfig, type ProxyOptions } from 'vite'

// While developing, API calls and uploaded images go to a local PHP server
// (php -S 127.0.0.1:8081 -t .). The live site serves both from the same domain.
const phpServer: ProxyOptions = {
  target: 'http://127.0.0.1:8081',
  // The API only accepts requests whose Origin matches the Host it was called on,
  // so pass the browser's Host through instead of the PHP server's own address.
  configure: (proxy) => {
    proxy.on('proxyReq', (proxyRequest, request) => {
      if (request.headers.host) proxyRequest.setHeader('host', request.headers.host)
    })
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': phpServer, '/uploads': phpServer } },
  // "vite preview" serves the built app the same way, which is how offline support is tested.
  preview: { proxy: { '/api': phpServer, '/uploads': phpServer } },
})
