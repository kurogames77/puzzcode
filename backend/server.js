const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const { createErrorResponse } = require('./utils/errorHandler');
const logger = require('./utils/logger');
const { getLocalIP } = require('./utils/networkUtils');
const { setupWebSocketHandlers } = require('./routes/websocket');
const { startMatchmakingProcessor } = require('./services/websocketMatchmaking');

const app = express();
const server = http.createServer(app);
// CORS Configuration
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    // Define allowed origins
    const allowedOrigins = [
      // Production domains
      'https://puzzcode.vercel.app',
      'https://puzzcode-backend-2.vercel.app',
      // Development domains
      'http://localhost:3000',
      'http://localhost:3001',
      // Vercel preview URLs (all subdomains)
      /^https?:\/\/puzzcode-[a-z0-9-]+\.vercel\.app$/,
      /^https?:\/\/puzzcode-git-[a-z0-9-]+-kurogames77\.vercel\.app$/,
      // Additional domains from environment variable
      ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(s => s.trim().replace(/\/+$/, '')) : [])
    ];

    // In development, allow all localhost and vercel.app subdomains
    if (process.env.NODE_ENV !== 'production') {
      if (origin.startsWith('http://localhost:') || origin.endsWith('.vercel.app')) {
        return callback(null, true);
      }
    }

    // Check if origin matches any allowed pattern
    const isAllowed = allowedOrigins.some(pattern => {
      if (typeof pattern === 'string') {
        return pattern === origin;
      } else if (pattern instanceof RegExp) {
        return pattern.test(origin);
      }
      return false;
    });

    if (isAllowed) {
      return callback(null, true);
    }

    // Log blocked origins for debugging
    console.log('CORS blocked origin:', origin);
    console.log('Allowed origins:', allowedOrigins);
    callback(new Error(`Not allowed by CORS. Origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'x-requested-with'],
  exposedHeaders: ['Content-Range', 'X-Total-Count', 'X-Request-ID'],
  maxAge: 600 // Cache preflight requests for 10 minutes
};

// Initialize Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // Same origin check as the main CORS config
      if (!origin) return callback(null, true);
      
      const allowedOrigins = [
        'https://puzzcode.vercel.app',
        'https://puzzcode-backend-2.vercel.app',
        'http://localhost:3000',
        'http://localhost:3001',
        /^https?:\/\/puzzcode-[a-z0-9-]+\.vercel\.app$/,
        /^https?:\/\/puzzcode-git-[a-z0-9-]+-kurogames77\.vercel\.app$/,
        ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(s => s.trim().replace(/\/+$/, '')) : [])
      ];

      if (process.env.NODE_ENV !== 'production') {
        if (origin.startsWith('http://localhost:') || origin.endsWith('.vercel.app')) {
          return callback(null, true);
        }
      }

      const isAllowed = allowedOrigins.some(pattern => {
        if (typeof pattern === 'string') return pattern === origin;
        if (pattern instanceof RegExp) return pattern.test(origin);
        return false;
      });

      if (isAllowed) return callback(null, true);
      
      console.log('WebSocket CORS blocked origin:', origin);
      callback(new Error('Not allowed by WebSocket CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'x-requested-with']
  },
  // Add ping timeout and connection timeout
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000
});

const PORT = process.env.PORT || 3001;

// Apply CORS middleware
app.use(cors(corsOptions));

// Increase body size limits for profile updates and file uploads
// Default is 100kb, increase to 10MB for JSON and 50MB for URL-encoded (for file uploads)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request ID middleware for error tracking
app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || 
    `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  res.setHeader('X-Request-ID', req.requestId);
  next();
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/lessons', require('./routes/lessons'));
app.use('/api/levels', require('./routes/levels'));
app.use('/api/puzzle', require('./routes/puzzle'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/achievements', require('./routes/achievements'));
app.use('/api/leaderboard', require('./routes/leaderboard'));
app.use('/api/battle', require('./routes/battle'));

// Local IP endpoint for other devices to connect
app.get('/api/network/local-ip', (req, res) => {
  const localIP = getLocalIP();
  res.json({
    success: true,
    localIP,
    port: PORT,
    websocketUrl: localIP ? `http://${localIP}:${PORT}` : null
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'PuzzCode API is running' });
});

// 404 handler
app.use((req, res) => {
  logger.warn('route_not_found', {
    method: req.method,
    path: req.path,
    requestId: req.requestId
  });
  res.status(404).json({
    success: false,
    error: 'Route not found',
    type: 'NOT_FOUND',
    requestId: req.requestId
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  // Log error with context
  logger.error('unhandled_error', {
    error: err.message,
    stack: err.stack,
    name: err.name,
    code: err.code,
    method: req.method,
    path: req.path,
    requestId: req.requestId,
    userId: req.user?.id || null
  });

  // Create standardized error response
  const { statusCode, response } = createErrorResponse(err, {
    includeStack: process.env.NODE_ENV === 'development',
    includeDetails: process.env.NODE_ENV === 'development',
    requestId: req.requestId,
    userId: req.user?.id || null
  });

  res.status(statusCode).json(response);
});

// Setup WebSocket handlers
setupWebSocketHandlers(io);

// Pass io instance to battle routes for exit notifications
const battleRouter = require('./routes/battle');
if (typeof battleRouter.setSocketIO === 'function') {
  battleRouter.setSocketIO(io);
}

// Start matchmaking processor
startMatchmakingProcessor(io, 2000); // Process every 2 seconds for faster matching

// Export io instance for use in other modules if needed
module.exports = { app, server, io };

server.listen(PORT, () => {
  const localIP = getLocalIP();
  console.log(`Server is running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  if (localIP) {
    console.log(`\n🌐 Local Network Access:`);
    console.log(`   WebSocket: ws://${localIP}:${PORT}`);
    console.log(`   HTTP API: http://${localIP}:${PORT}/api`);
    console.log(`\n   Other devices can connect using the IP: ${localIP}`);
  } else {
    console.log(`\n⚠️  Could not detect local IP address. Other devices may not be able to connect.`);
  }
});

