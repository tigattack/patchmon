require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createPrismaClient, waitForDatabase, disconnectPrisma } = require('./config/database');
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
const { initSettings } = require('./services/settingsService');

// Initialize Prisma client with optimized connection pooling for multiple instances
const prisma = createPrismaClient();

// Simple version comparison function for semantic versioning
function compareVersions(version1, version2) {
  const v1Parts = version1.split('.').map(Number);
  const v2Parts = version2.split('.').map(Number);

  // Ensure both arrays have the same length
  const maxLength = Math.max(v1Parts.length, v2Parts.length);
  while (v1Parts.length < maxLength) v1Parts.push(0);
  while (v2Parts.length < maxLength) v2Parts.push(0);

  for (let i = 0; i < maxLength; i++) {
    if (v1Parts[i] > v2Parts[i]) return true;
    if (v1Parts[i] < v2Parts[i]) return false;
  }

  return false; // versions are equal
}

// Function to check and import agent version on startup
async function checkAndImportAgentVersion() {
  console.log('🔍 Starting agent version auto-import check...');

  // Skip if auto-import is disabled
  if (process.env.AUTO_IMPORT_AGENT_VERSION === 'false') {
    console.log('❌ Auto-import of agent version is disabled');
    if (process.env.ENABLE_LOGGING === 'true') {
      logger.info('Auto-import of agent version is disabled');
    }
    return;
  }

  try {
    const fs = require('fs');
    const path = require('path');
    const crypto = require('crypto');

    // Read and validate agent script
    const agentScriptPath = path.join(__dirname, '../../agents/patchmon-agent.sh');
    console.log('📁 Agent script path:', agentScriptPath);

    // Check if file exists
    if (!fs.existsSync(agentScriptPath)) {
      console.log('❌ Agent script file not found, skipping version check');
      if (process.env.ENABLE_LOGGING === 'true') {
        logger.warn('Agent script file not found, skipping version check');
      }
      return;
    }

    console.log('✅ Agent script file found');

    // Read the file content
    const scriptContent = fs.readFileSync(agentScriptPath, 'utf8');

    // Extract version from script content
    const versionMatch = scriptContent.match(/AGENT_VERSION="([^"]+)"/);

    if (!versionMatch) {
      console.log('❌ Could not extract version from agent script, skipping version check');
      if (process.env.ENABLE_LOGGING === 'true') {
        logger.warn('Could not extract version from agent script, skipping version check');
      }
      return;
    }

    const localVersion = versionMatch[1];
    console.log('📋 Local version:', localVersion);

    // Check if this version already exists in database
    const existingVersion = await prisma.agent_versions.findUnique({
      where: { version: localVersion }
    });

    if (existingVersion) {
      console.log(`✅ Agent version ${localVersion} already exists in database`);
      if (process.env.ENABLE_LOGGING === 'true') {
        logger.info(`Agent version ${localVersion} already exists in database`);
      }
      return;
    }

    console.log(`🆕 Agent version ${localVersion} not found in database`);

    // Get existing versions for comparison
    const allVersions = await prisma.agent_versions.findMany({
      select: { version: true },
      orderBy: { created_at: 'desc' }
    });

    // Determine version flags and whether to proceed
    const isFirstVersion = allVersions.length === 0;
    const isNewerVersion = !isFirstVersion && compareVersions(localVersion, allVersions[0].version);

    if (!isFirstVersion && !isNewerVersion) {
      console.log(`❌ Agent version ${localVersion} is not newer than existing versions, skipping import`);
      if (process.env.ENABLE_LOGGING === 'true') {
        logger.info(`Agent version ${localVersion} is not newer than existing versions, skipping import`);
      }
      return;
    }

    const shouldSetAsCurrent = isFirstVersion || isNewerVersion;
    const shouldSetAsDefault = isFirstVersion;

    console.log(isFirstVersion ?
      `📊 No existing versions found in database` :
      `📊 Found ${allVersions.length} existing versions in database, latest: ${allVersions[0].version}`
    );

    if (!isFirstVersion) {
      console.log(`🔄 Version comparison: ${localVersion} > ${allVersions[0].version} = ${isNewerVersion}`);
    }

    // Clear existing flags if needed
    const updatePromises = [];
    if (shouldSetAsCurrent) {
      updatePromises.push(prisma.agent_versions.updateMany({
        where: { is_current: true },
        data: { is_current: false }
      }));
    }
    if (shouldSetAsDefault) {
      updatePromises.push(prisma.agent_versions.updateMany({
        where: { is_default: true },
        data: { is_default: false }
      }));
    }

    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
    }

    // Create new version
    await prisma.agent_versions.create({
      data: {
        id: crypto.randomUUID(),
        version: localVersion,
        release_notes: `Auto-imported on startup (${new Date().toISOString()})`,
        script_content: scriptContent,
        is_default: shouldSetAsDefault,
        is_current: shouldSetAsCurrent,
        updated_at: new Date()
      }
    });

    console.log(`🎉 Successfully auto-imported new agent version ${localVersion} on startup`);
    if (shouldSetAsCurrent) {
      console.log(`✅ Set version ${localVersion} as current version`);
    }
    if (shouldSetAsDefault) {
      console.log(`✅ Set version ${localVersion} as default version`);
    }
    if (process.env.ENABLE_LOGGING === 'true') {
      logger.info(`✅ Auto-imported new agent version ${localVersion} on startup (current: ${shouldSetAsCurrent}, default: ${shouldSetAsDefault})`);
    }

  } catch (error) {
    console.error('❌ Failed to check/import agent version on startup:', error.message);
    if (process.env.ENABLE_LOGGING === 'true') {
      logger.error('Failed to check/import agent version on startup:', error.message);
    }
  }
}

// Initialize logger - only if logging is enabled
const logger = process.env.ENABLE_LOGGING === 'true' ? winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [],
}) : {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {}
};

// Configure transports based on PM_LOG_TO_CONSOLE environment variable
if (process.env.ENABLE_LOGGING === 'true') {
  const logToConsole = process.env.PM_LOG_TO_CONSOLE === '1' || process.env.PM_LOG_TO_CONSOLE === 'true';

  if (logToConsole) {
    // Log to stdout/stderr instead of files
    logger.add(new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ timestamp, level, message, stack }) => {
          return `${timestamp} [${level.toUpperCase()}]: ${stack || message}`;
        })
      ),
      stderrLevels: ['error', 'warn']
    }));
  } else {
    // Log to files (default behavior)
    logger.add(new winston.transports.File({ filename: 'logs/error.log', level: 'error' }));
    logger.add(new winston.transports.File({ filename: 'logs/combined.log' }));

    // Also add console logging for non-production environments
    if (process.env.NODE_ENV !== 'production') {
      logger.add(new winston.transports.Console({
        format: winston.format.simple()
      }));
    }
  }
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
  origin: function (origin, callback) {
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
  app.use((req, _, next) => {
    // Log health check requests at debug level to reduce log spam
    if (req.path === '/health') {
      logger.debug(`${req.method} ${req.path} - ${req.ip}`);
    } else {
      logger.info(`${req.method} ${req.path} - ${req.ip}`);
    }
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
    // Wait for database to be available
    await waitForDatabase(prisma);

    if (process.env.ENABLE_LOGGING === 'true') {
      logger.info('✅ Database connection successful');
    }

    // Initialise settings on startup
    try {
      await initSettings();
      if (process.env.ENABLE_LOGGING === 'true') {
        logger.info('✅ Settings initialised');
      }
    } catch (initError) {
      if (process.env.ENABLE_LOGGING === 'true') {
        logger.error('❌ Failed to initialise settings:', initError.message);
      }
      throw initError; // Fail startup if settings can't be initialised
    }

    // Check and import agent version on startup
    await checkAndImportAgentVersion();

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
