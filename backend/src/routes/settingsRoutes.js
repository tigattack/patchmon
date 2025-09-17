const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middleware/auth');
const { requireManageSettings } = require('../middleware/permissions');

const router = express.Router();
const prisma = new PrismaClient();

// Function to trigger crontab updates on all hosts with auto-update enabled
async function triggerCrontabUpdates() {
  try {
    console.log('Triggering crontab updates on all hosts with auto-update enabled...');
    
    // Get all hosts that have auto-update enabled
    const hosts = await prisma.host.findMany({
      where: { 
        autoUpdate: true,
        status: 'active' // Only update active hosts
      },
      select: {
        id: true,
        hostname: true,
        apiId: true,
        apiKey: true
      }
    });
    
    console.log(`Found ${hosts.length} hosts with auto-update enabled`);
    
    // For each host, we'll send a special update command that triggers crontab update
    // This is done by sending a ping with a special flag
    for (const host of hosts) {
      try {
        console.log(`Triggering crontab update for host: ${host.hostname}`);
        
        // We'll use the existing ping endpoint but add a special parameter
        // The agent will detect this and run update-crontab command
        const http = require('http');
        const https = require('https');
        
        const serverUrl = process.env.SERVER_URL || 'http://localhost:3001';
        const url = new URL(`${serverUrl}/api/v1/hosts/ping`);
        const isHttps = url.protocol === 'https:';
        const client = isHttps ? https : http;
        
        const postData = JSON.stringify({
          triggerCrontabUpdate: true,
          message: 'Update interval changed, please update your crontab'
        });
        
        const options = {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            'X-API-ID': host.apiId,
            'X-API-KEY': host.apiKey
          }
        };
        
        const req = client.request(options, (res) => {
          if (res.statusCode === 200) {
            console.log(`Successfully triggered crontab update for ${host.hostname}`);
          } else {
            console.error(`Failed to trigger crontab update for ${host.hostname}: ${res.statusCode}`);
          }
        });
        
        req.on('error', (error) => {
          console.error(`Error triggering crontab update for ${host.hostname}:`, error.message);
        });
        
        req.write(postData);
        req.end();
      } catch (error) {
        console.error(`Error triggering crontab update for ${host.hostname}:`, error.message);
      }
    }
    
    console.log('Crontab update trigger completed');
  } catch (error) {
    console.error('Error in triggerCrontabUpdates:', error);
  }
}

// Get current settings
router.get('/', authenticateToken, requireManageSettings, async (req, res) => {
  try {
    let settings = await prisma.settings.findFirst();
    
    // If no settings exist, create default settings
    if (!settings) {
      settings = await prisma.settings.create({
        data: {
          serverUrl: 'http://localhost:3001',
          serverProtocol: 'http',
          serverHost: 'localhost',
          serverPort: 3001,
          frontendUrl: 'http://localhost:3000',
          updateInterval: 60,
          autoUpdate: false
        }
      });
    }
    
    console.log('Returning settings:', settings);
    res.json(settings);
  } catch (error) {
    console.error('Settings fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update settings
router.put('/', authenticateToken, requireManageSettings, [
  body('serverProtocol').isIn(['http', 'https']).withMessage('Protocol must be http or https'),
  body('serverHost').isLength({ min: 1 }).withMessage('Server host is required'),
  body('serverPort').isInt({ min: 1, max: 65535 }).withMessage('Port must be between 1 and 65535'),
  body('frontendUrl').isLength({ min: 1 }).withMessage('Frontend URL is required'),
  body('updateInterval').isInt({ min: 5, max: 1440 }).withMessage('Update interval must be between 5 and 1440 minutes'),
  body('autoUpdate').isBoolean().withMessage('Auto update must be a boolean'),
  body('githubRepoUrl').optional().isLength({ min: 1 }).withMessage('GitHub repo URL must be a non-empty string')
], async (req, res) => {
  try {
    console.log('Settings update request body:', req.body);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { serverProtocol, serverHost, serverPort, frontendUrl, updateInterval, autoUpdate, githubRepoUrl } = req.body;
    console.log('Extracted values:', { serverProtocol, serverHost, serverPort, frontendUrl, updateInterval, autoUpdate, githubRepoUrl });
    
    // Construct server URL from components
    const serverUrl = `${serverProtocol}://${serverHost}:${serverPort}`;
    
    let settings = await prisma.settings.findFirst();
    
    if (settings) {
      // Update existing settings
      console.log('Updating existing settings with data:', {
        serverUrl,
        serverProtocol,
        serverHost,
        serverPort,
        frontendUrl,
        updateInterval: updateInterval || 60,
        autoUpdate: autoUpdate || false,
        githubRepoUrl: githubRepoUrl || 'git@github.com:9technologygroup/patchmon.net.git'
      });
      const oldUpdateInterval = settings.updateInterval;
      
      settings = await prisma.settings.update({
        where: { id: settings.id },
        data: {
          serverUrl,
          serverProtocol,
          serverHost,
          serverPort,
          frontendUrl,
          updateInterval: updateInterval || 60,
          autoUpdate: autoUpdate || false,
          githubRepoUrl: githubRepoUrl || 'git@github.com:9technologygroup/patchmon.net.git'
        }
      });
      console.log('Settings updated successfully:', settings);
      
      // If update interval changed, trigger crontab updates on all hosts with auto-update enabled
      if (oldUpdateInterval !== (updateInterval || 60)) {
        console.log(`Update interval changed from ${oldUpdateInterval} to ${updateInterval || 60} minutes. Triggering crontab updates...`);
        await triggerCrontabUpdates();
      }
    } else {
      // Create new settings
      settings = await prisma.settings.create({
        data: {
          serverUrl,
          serverProtocol,
          serverHost,
          serverPort,
          frontendUrl,
          updateInterval: updateInterval || 60,
          autoUpdate: autoUpdate || false,
          githubRepoUrl: githubRepoUrl || 'git@github.com:9technologygroup/patchmon.net.git'
        }
      });
    }
    
    res.json({
      message: 'Settings updated successfully',
      settings
    });
  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Get server URL for public use (used by installation scripts)
router.get('/server-url', async (req, res) => {
  try {
    const settings = await prisma.settings.findFirst();
    
    if (!settings) {
      return res.json({ serverUrl: 'http://localhost:3001' });
    }
    
    res.json({ serverUrl: settings.serverUrl });
  } catch (error) {
    console.error('Server URL fetch error:', error);
    res.json({ serverUrl: 'http://localhost:3001' });
  }
});

// Get update interval policy for agents (public endpoint)
router.get('/update-interval', async (req, res) => {
  try {
    const settings = await prisma.settings.findFirst();
    
    if (!settings) {
      return res.json({ updateInterval: 60 });
    }
    
    res.json({ 
      updateInterval: settings.updateInterval,
      cronExpression: `*/${settings.updateInterval} * * * *` // Generate cron expression
    });
  } catch (error) {
    console.error('Update interval fetch error:', error);
    res.json({ updateInterval: 60, cronExpression: '0 * * * *' });
  }
});

// Get auto-update policy for agents (public endpoint)
router.get('/auto-update', async (req, res) => {
  try {
    const settings = await prisma.settings.findFirst();
    
    if (!settings) {
      return res.json({ autoUpdate: false });
    }
    
    res.json({ 
      autoUpdate: settings.autoUpdate || false
    });
  } catch (error) {
    console.error('Auto-update fetch error:', error);
    res.json({ autoUpdate: false });
  }
});

module.exports = router;
