require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createPrismaClient, checkDatabaseConnection, disconnectPrisma } = require('./config/database');
const winston = require('winston');

// Import routes
const authRoutes = require('./routes/authRoutes');
const hostRoutes = require('./routes/hostRoutes');
const hostGroupRoutes = require('./routes/hostGroupRoutes');
const packageRoutes = require('./routes/packageRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const permissionsRoutes = require('./routes/permissionsRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const dashboardPreferencesRoutes = require('./routes/dashboardPreferencesRoutes');
const repositoryRoutes = require('./routes/repositoryRoutes');
const versionRoutes = require('./routes/versionRoutes');
const tfaRoutes = require('./routes/tfaRoutes');
const updateScheduler = require('./services/updateScheduler');

// Initialize Prisma client with optimized connection pooling for multiple instances
const prisma = createPrismaClient();

// Initialize logger - only if logging is enabled
const logger = process.env.ENABLE_LOGGING === 'true' ? winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
}) : {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {}
};

if (process.env.ENABLE_LOGGING === 'true' && process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy (needed when behind reverse proxy) and remove X-Powered-By
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : parseInt(process.env.TRUST_PROXY, 10) || true);
} else {
  app.set('trust proxy', 1);
}
app.disable('x-powered-by');

// Rate limiting with monitoring
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  skipFailedRequests: false, // Count failed requests
});

// Middleware
// Helmet with stricter defaults (CSP/HSTS only in production)
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"]
    }
  } : false,
  hsts: process.env.ENABLE_HSTS === 'true' || process.env.NODE_ENV === 'production'
}));

// CORS allowlist from comma-separated env
const parseOrigins = (val) => (val || '').split(',').map(s => s.trim()).filter(Boolean);
const allowedOrigins = parseOrigins(process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || 'http://localhost:3000');
app.use(cors({
  origin: function(origin, callback) {
    // Allow non-browser/SSR tools with no origin
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(limiter);
// Reduce body size limits to reasonable defaults
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '5mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.JSON_BODY_LIMIT || '5mb' }));

// Request logging - only if logging is enabled
if (process.env.ENABLE_LOGGING === 'true') {
  app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path} - ${req.ip}`);
    next();
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
const apiVersion = process.env.API_VERSION || 'v1';

// Per-route rate limits with monitoring
const authLimiter = rateLimit({
  windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 10 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 20,
  message: {
    error: 'Too many authentication requests, please try again later.',
    retryAfter: Math.ceil((parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 10 * 60 * 1000) / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});
const agentLimiter = rateLimit({
  windowMs: parseInt(process.env.AGENT_RATE_LIMIT_WINDOW_MS) || 60 * 1000,
  max: parseInt(process.env.AGENT_RATE_LIMIT_MAX) || 120,
  message: {
    error: 'Too many agent requests, please try again later.',
    retryAfter: Math.ceil((parseInt(process.env.AGENT_RATE_LIMIT_WINDOW_MS) || 60 * 1000) / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});


app.use(`/api/${apiVersion}/auth`, authLimiter, authRoutes);
app.use(`/api/${apiVersion}/hosts`, agentLimiter, hostRoutes);
app.use(`/api/${apiVersion}/host-groups`, hostGroupRoutes);
app.use(`/api/${apiVersion}/packages`, packageRoutes);
app.use(`/api/${apiVersion}/dashboard`, dashboardRoutes);
app.use(`/api/${apiVersion}/permissions`, permissionsRoutes);
app.use(`/api/${apiVersion}/settings`, settingsRoutes);
app.use(`/api/${apiVersion}/dashboard-preferences`, dashboardPreferencesRoutes);
app.use(`/api/${apiVersion}/repositories`, repositoryRoutes);
app.use(`/api/${apiVersion}/version`, versionRoutes);
app.use(`/api/${apiVersion}/tfa`, tfaRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  if (process.env.ENABLE_LOGGING === 'true') {
    logger.error(err.stack);
  }
  res.status(500).json({ 
    error: 'Something went wrong!', 
    message: process.env.NODE_ENV === 'development' ? err.message : undefined 
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  if (process.env.ENABLE_LOGGING === 'true') {
    logger.info('SIGINT received, shutting down gracefully');
  }
  updateScheduler.stop();
  await disconnectPrisma(prisma);
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (process.env.ENABLE_LOGGING === 'true') {
    logger.info('SIGTERM received, shutting down gracefully');
  }
  updateScheduler.stop();
  await disconnectPrisma(prisma);
  process.exit(0);
});

// Start server with database health check
async function startServer() {
  try {
    // Check database connection before starting server
    const isConnected = await checkDatabaseConnection(prisma);
    if (!isConnected) {
      console.error('❌ Database connection failed. Server not started.');
      process.exit(1);
    }
    
    if (process.env.ENABLE_LOGGING === 'true') {
      logger.info('✅ Database connection successful');
    }
    
    app.listen(PORT, () => {
      if (process.env.ENABLE_LOGGING === 'true') {
        logger.info(`Server running on port ${PORT}`);
        logger.info(`Environment: ${process.env.NODE_ENV}`);
      }
      
      // Start update scheduler
      updateScheduler.start();
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();

module.exports = app; 