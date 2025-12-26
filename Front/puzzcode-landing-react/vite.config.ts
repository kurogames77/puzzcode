import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
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
    target: 'es2020',
    minify: 'terser',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          vendor: ['axios', 'socket.io-client'],
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
  define: {
    'process.env': {}
  }
});
