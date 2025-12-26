import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import checker from 'vite-plugin-checker';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    checker({
      typescript: true,
      eslint: {
        lintCommand: 'eslint "src/**/*.{ts,tsx}"',
      },
    }),
  ],
  // Development server configuration
  server: {
    host: '0.0.0.0',
    port: 5178,
    strictPort: true,
    open: true,
  },
  // Build optimization
  build: {
    target: 'esnext',
    minify: 'esbuild',
    chunkSizeWarningLimit: 1000, // Increase chunk size warning limit to 1MB
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor libraries into separate chunks
          react: ['react', 'react-dom', 'react-router-dom'],
          vendor: ['axios', 'socket.io-client'],
          // Add other large dependencies here
        },
      },
    },
  },
  // CSS configuration
  css: {
    preprocessorOptions: {
      scss: {
        // Add global SCSS imports
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
  // Resolve configuration
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  // Environment variables
  define: {
    'process.env': {}
  }
});
