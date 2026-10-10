import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, proxy Socket.IO to the Node server so the client can use same-origin URLs.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/socket.io': { target: 'http://localhost:4000', ws: true } } },
});
