import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react({
      jsxImportSource: '@emotion/react',
      babel: {
        plugins: ['@emotion/babel-plugin'],
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5178,
    strictPort: true,
    open: true,
  },
  build: {
    target: 'esnext',
    minify: 'terser',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          vendor: ['axios', 'socket.io-client', 'framer-motion'],
        },
      },
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `
          @use "sass:color";
          @use "sass:math";
          @use "sass:list";
          @use "sass:map";
          @use "sass:meta";
          @use "sass:string";
        `,
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
