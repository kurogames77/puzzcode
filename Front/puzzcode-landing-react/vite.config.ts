import { defineConfig } from 'vite';

// Force IPv4 binding and stable port for local access
export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5178,
    strictPort: true,
  },
});


