const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { requireManageHosts, requireManageSettings } = require('../middleware/permissions');

const router = express.Router();
const prisma = new PrismaClient();

// Public endpoint to download the agent script
router.get('/agent/download', async (req, res) => {
  try {
    const { version } = req.query;
    
    let agentVersion;
    
    if (version) {
      // Download specific version
      agentVersion = await prisma.agentVersion.findUnique({
        where: { version }
      });
      
      if (!agentVersion) {
        return res.status(404).json({ error: 'Agent version not found' });
      }
    } else {
      // Download current version (latest)
      agentVersion = await prisma.agentVersion.findFirst({
        where: { isCurrent: true },
        orderBy: { createdAt: 'desc' }
      });

      if (!agentVersion) {
        // Fallback to default version
        agentVersion = await prisma.agentVersion.findFirst({
          where: { isDefault: true },
          orderBy: { createdAt: 'desc' }
        });
      }
    }
    
    if (!agentVersion) {
      return res.status(404).json({ error: 'No agent version available' });
    }
    
    // Use script content from database if available, otherwise fallback to file
    if (agentVersion.scriptContent) {
      res.setHeader('Content-Type', 'application/x-shellscript');
      res.setHeader('Content-Disposition', `attachment; filename="patchmon-agent-${agentVersion.version}.sh"`);
      res.send(agentVersion.scriptContent);
    } else {
      // Fallback to file system
      const agentPath = path.join(__dirname, '../../../agents/patchmon-agent.sh');
      
      if (!fs.existsSync(agentPath)) {
        return res.status(404).json({ error: 'Agent script not found' });
      }

      res.setHeader('Content-Type', 'application/x-shellscript');
      res.setHeader('Content-Disposition', `attachment; filename="patchmon-agent-${agentVersion.version}.sh"`);
      res.sendFile(path.resolve(agentPath));
    }
  } catch (error) {
    console.error('Agent download error:', error);
    res.status(500).json({ error: 'Failed to download agent script' });
  }
});

// Version check endpoint for agents
router.get('/agent/version', async (req, res) => {
  try {
    const currentVersion = await prisma.agentVersion.findFirst({
      where: { isCurrent: true },
      orderBy: { createdAt: 'desc' }
    });

    if (!currentVersion) {
      return res.status(404).json({ error: 'No current agent version found' });
    }

    res.json({
      currentVersion: currentVersion.version,
      downloadUrl: currentVersion.downloadUrl || `/api/v1/hosts/agent/download`,
      releaseNotes: currentVersion.releaseNotes,
      minServerVersion: currentVersion.minServerVersion
    });
  } catch (error) {
    console.error('Version check error:', error);
    res.status(500).json({ error: 'Failed to get agent version' });
  }
});

// Generate API credentials
const generateApiCredentials = () => {
  const apiId = `patchmon_${crypto.randomBytes(8).toString('hex')}`;
  const apiKey = crypto.randomBytes(32).toString('hex');
  return { apiId, apiKey };
};

// Middleware to validate API credentials
const validateApiCredentials = async (req, res, next) => {
  try {
    const apiId = req.headers['x-api-id'] || req.body.apiId;
    const apiKey = req.headers['x-api-key'] || req.body.apiKey;
    
    if (!apiId || !apiKey) {
      return res.status(401).json({ error: 'API ID and Key required' });
    }

    const host = await prisma.host.findFirst({
      where: { 
        apiId: apiId,
        apiKey: apiKey
      }
    });

    if (!host) {
      return res.status(401).json({ error: 'Invalid API credentials' });
    }

    req.hostRecord = host;
    next();
  } catch (error) {
    console.error('API credential validation error:', error);
    res.status(500).json({ error: 'API credential validation failed' });
  }
};

// Admin endpoint to create a new host manually (replaces auto-registration)
router.post('/create', authenticateToken, requireManageHosts, [
  body('hostname').isLength({ min: 1 }).withMessage('Hostname is required'),
  body('hostGroupId').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { hostname, hostGroupId } = req.body;
    
    // Generate unique API credentials for this host
    const { apiId, apiKey } = generateApiCredentials();
    
    // Check if host already exists
    const existingHost = await prisma.host.findUnique({
      where: { hostname }
    });

    if (existingHost) {
      return res.status(409).json({ error: 'Host already exists' });
    }

    // If hostGroupId is provided, verify the group exists
    if (hostGroupId) {
      const hostGroup = await prisma.hostGroup.findUnique({
        where: { id: hostGroupId }
      });

      if (!hostGroup) {
        return res.status(400).json({ error: 'Host group not found' });
      }
    }

    // Create new host with API credentials - system info will be populated when agent connects
    const host = await prisma.host.create({
      data: {
        hostname,
        osType: 'unknown', // Will be updated when agent connects
        osVersion: 'unknown', // Will be updated when agent connects
        ip: null, // Will be updated when agent connects
        architecture: null, // Will be updated when agent connects
        apiId,
        apiKey,
        hostGroupId: hostGroupId || null,
        status: 'pending' // Will change to 'active' when agent connects
      },
      include: {
        hostGroup: {
          select: {
            id: true,
            name: true,
            color: true
          }
        }
      }
    });

    res.status(201).json({
      message: 'Host created successfully',
      hostId: host.id,
      hostname: host.hostname,
      apiId: host.apiId,
      apiKey: host.apiKey,
      hostGroup: host.hostGroup,
      instructions: 'Use these credentials in your patchmon agent configuration. System information will be automatically detected when the agent connects.'
    });
  } catch (error) {
    console.error('Host creation error:', error);
    res.status(500).json({ error: 'Failed to create host' });
  }
});

// Legacy register endpoint (deprecated - returns error message)
router.post('/register', async (req, res) => {
  res.status(400).json({ 
    error: 'Host registration has been disabled. Please contact your administrator to add this host to PatchMon.',
    deprecated: true,
    message: 'Hosts must now be pre-created by administrators with specific API credentials.'
  });
});

// Update host information and packages (now uses API credentials)
router.post('/update', validateApiCredentials, [
  body('packages').isArray().withMessage('Packages must be an array'),
  body('packages.*.name').isLength({ min: 1 }).withMessage('Package name is required'),
  body('packages.*.currentVersion').isLength({ min: 1 }).withMessage('Current version is required'),
  body('packages.*.availableVersion').optional().isLength({ min: 1 }),
  body('packages.*.needsUpdate').isBoolean().withMessage('needsUpdate must be boolean'),
  body('packages.*.isSecurityUpdate').optional().isBoolean().withMessage('isSecurityUpdate must be boolean'),
  body('agentVersion').optional().isLength({ min: 1 }).withMessage('Agent version must be a non-empty string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { packages, repositories } = req.body;
    const host = req.hostRecord;

    // Update host last update timestamp and OS info if provided
    const updateData = { lastUpdate: new Date() };
    if (req.body.osType) updateData.osType = req.body.osType;
    if (req.body.osVersion) updateData.osVersion = req.body.osVersion;
    if (req.body.ip) updateData.ip = req.body.ip;
    if (req.body.architecture) updateData.architecture = req.body.architecture;
    if (req.body.agentVersion) updateData.agentVersion = req.body.agentVersion;
    
    // If this is the first update (status is 'pending'), change to 'active'
    if (host.status === 'pending') {
      updateData.status = 'active';
    }

    await prisma.host.update({
      where: { id: host.id },
      data: updateData
    });

    // Process packages in transaction
    await prisma.$transaction(async (tx) => {
      // Clear existing host packages
      await tx.hostPackage.deleteMany({
        where: { hostId: host.id }
      });

      // Process each package
      for (const packageData of packages) {
        // Find or create package
        let pkg = await tx.package.findUnique({
          where: { name: packageData.name }
        });

        if (!pkg) {
          pkg = await tx.package.create({
            data: {
              name: packageData.name,
              description: packageData.description || null,
              category: packageData.category || null,
              latestVersion: packageData.availableVersion || packageData.currentVersion
            }
          });
        } else {
          // Update package latest version if newer
          if (packageData.availableVersion && packageData.availableVersion !== pkg.latestVersion) {
            await tx.package.update({
              where: { id: pkg.id },
              data: { latestVersion: packageData.availableVersion }
            });
          }
        }

        // Create host package relationship
        await tx.hostPackage.create({
          data: {
            hostId: host.id,
            packageId: pkg.id,
            currentVersion: packageData.currentVersion,
            availableVersion: packageData.availableVersion || null,
            needsUpdate: packageData.needsUpdate,
            isSecurityUpdate: packageData.isSecurityUpdate || false,
            lastChecked: new Date()
          }
        });
      }

      // Process repositories if provided
      if (repositories && Array.isArray(repositories)) {
        // Clear existing host repositories
        await tx.hostRepository.deleteMany({
          where: { hostId: host.id }
        });

        // Deduplicate repositories by URL+distribution+components to avoid constraint violations
        const uniqueRepos = new Map();
        for (const repoData of repositories) {
          const key = `${repoData.url}|${repoData.distribution}|${repoData.components}`;
          if (!uniqueRepos.has(key)) {
            uniqueRepos.set(key, repoData);
          }
        }

        // Process each unique repository
        for (const repoData of uniqueRepos.values()) {
          // Find or create repository
          let repo = await tx.repository.findFirst({
            where: {
              url: repoData.url,
              distribution: repoData.distribution,
              components: repoData.components
            }
          });

          if (!repo) {
            repo = await tx.repository.create({
              data: {
                name: repoData.name,
                url: repoData.url,
                distribution: repoData.distribution,
                components: repoData.components,
                repoType: repoData.repoType,
                isActive: true,
                isSecure: repoData.isSecure || false,
                description: `${repoData.repoType} repository for ${repoData.distribution}`
              }
            });
          }

          // Create host repository relationship
          await tx.hostRepository.create({
            data: {
              hostId: host.id,
              repositoryId: repo.id,
              isEnabled: repoData.isEnabled !== false, // Default to enabled
              lastChecked: new Date()
            }
          });
        }
      }
    });

    // Create update history record
    const securityCount = packages.filter(pkg => pkg.isSecurityUpdate).length;
    const updatesCount = packages.filter(pkg => pkg.needsUpdate).length;

    await prisma.updateHistory.create({
      data: {
        hostId: host.id,
        packagesCount: updatesCount,
        securityCount,
        status: 'success'
      }
    });

    // Check if auto-update is enabled and if there's a newer agent version available
    let autoUpdateResponse = null;
    try {
      const settings = await prisma.settings.findFirst();
      // Check both global auto-update setting AND host-specific auto-update setting
      if (settings && settings.autoUpdate && host.autoUpdate) {
        // Get current agent version from the request
        const currentAgentVersion = req.body.agentVersion;
        
        if (currentAgentVersion) {
          // Get the latest agent version
          const latestAgentVersion = await prisma.agentVersion.findFirst({
            where: { isCurrent: true },
            orderBy: { createdAt: 'desc' }
          });
          
          if (latestAgentVersion && latestAgentVersion.version !== currentAgentVersion) {
            // There's a newer version available
            autoUpdateResponse = {
              shouldUpdate: true,
              currentVersion: currentAgentVersion,
              latestVersion: latestAgentVersion.version,
              message: 'A newer agent version is available. Run: /usr/local/bin/patchmon-agent.sh update-agent',
              updateCommand: 'update-agent'
            };
          }
        }
      }
    } catch (error) {
      console.error('Auto-update check error:', error);
      // Don't fail the update if auto-update check fails
    }

    const response = {
      message: 'Host updated successfully',
      packagesProcessed: packages.length,
      updatesAvailable: updatesCount,
      securityUpdates: securityCount
    };

    // Add auto-update response if available
    if (autoUpdateResponse) {
      response.autoUpdate = autoUpdateResponse;
    }

    // Check if crontab update is needed (when update interval changes)
    // This is a simple check - if the host has auto-update enabled, we'll suggest crontab update
    if (host.autoUpdate) {
      // For now, we'll always suggest crontab update to ensure it's current
      // In a more sophisticated implementation, we could track when the interval last changed
      response.crontabUpdate = {
        shouldUpdate: true,
        message: 'Please ensure your crontab is up to date with current interval settings',
        command: 'update-crontab'
      };
    }

    res.json(response);
  } catch (error) {
    console.error('Host update error:', error);
    
    // Log error in update history
    try {
      await prisma.updateHistory.create({
        data: {
          hostId: req.hostRecord.id,
          packagesCount: 0,
          securityCount: 0,
          status: 'error',
          errorMessage: error.message
        }
      });
    } catch (logError) {
      console.error('Failed to log update error:', logError);
    }

    res.status(500).json({ error: 'Failed to update host' });
  }
});

// Get host information (now uses API credentials)
router.get('/info', validateApiCredentials, async (req, res) => {
  try {
    const host = await prisma.host.findUnique({
      where: { id: req.hostRecord.id },
      select: {
        id: true,
        hostname: true,
        ip: true,
        osType: true,
        osVersion: true,
        architecture: true,
        lastUpdate: true,
        status: true,
        createdAt: true,
        apiId: true // Include API ID for reference
      }
    });

    res.json(host);
  } catch (error) {
    console.error('Get host info error:', error);
    res.status(500).json({ error: 'Failed to fetch host information' });
  }
});

// Ping endpoint for health checks (now uses API credentials)
router.post('/ping', validateApiCredentials, async (req, res) => {
  try {
    // Update last update timestamp
    await prisma.host.update({
      where: { id: req.hostRecord.id },
      data: { lastUpdate: new Date() }
    });

    const response = { 
      message: 'Ping successful',
      timestamp: new Date().toISOString(),
      hostname: req.hostRecord.hostname
    };

    // Check if this is a crontab update trigger
    if (req.body.triggerCrontabUpdate && req.hostRecord.autoUpdate) {
      console.log(`Triggering crontab update for host: ${req.hostRecord.hostname}`);
      response.crontabUpdate = {
        shouldUpdate: true,
        message: 'Update interval changed, please run: /usr/local/bin/patchmon-agent.sh update-crontab',
        command: 'update-crontab'
      };
    }

    res.json(response);
  } catch (error) {
    console.error('Ping error:', error);
    res.status(500).json({ error: 'Ping failed' });
  }
});

// Admin endpoint to regenerate API credentials for a host
router.post('/:hostId/regenerate-credentials', authenticateToken, requireManageHosts, async (req, res) => {
  try {
    const { hostId } = req.params;
    
    const host = await prisma.host.findUnique({
      where: { id: hostId }
    });

    if (!host) {
      return res.status(404).json({ error: 'Host not found' });
    }

    // Generate new API credentials
    const { apiId, apiKey } = generateApiCredentials();

    // Update host with new credentials
    const updatedHost = await prisma.host.update({
      where: { id: hostId },
      data: { apiId, apiKey }
    });

    res.json({
      message: 'API credentials regenerated successfully',
      hostname: updatedHost.hostname,
      apiId: updatedHost.apiId,
      apiKey: updatedHost.apiKey,
      warning: 'Previous credentials are now invalid. Update your agent configuration.'
    });
  } catch (error) {
    console.error('Credential regeneration error:', error);
    res.status(500).json({ error: 'Failed to regenerate credentials' });
  }
});

// Admin endpoint to bulk update host groups
router.put('/bulk/group', authenticateToken, requireManageHosts, [
  body('hostIds').isArray().withMessage('Host IDs must be an array'),
  body('hostIds.*').isLength({ min: 1 }).withMessage('Each host ID must be provided'),
  body('hostGroupId').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { hostIds, hostGroupId } = req.body;

    // If hostGroupId is provided, verify the group exists
    if (hostGroupId) {
      const hostGroup = await prisma.hostGroup.findUnique({
        where: { id: hostGroupId }
      });

      if (!hostGroup) {
        return res.status(400).json({ error: 'Host group not found' });
      }
    }

    // Check if all hosts exist
    const existingHosts = await prisma.host.findMany({
      where: { id: { in: hostIds } },
      select: { id: true, hostname: true }
    });

    if (existingHosts.length !== hostIds.length) {
      const foundIds = existingHosts.map(h => h.id);
      const missingIds = hostIds.filter(id => !foundIds.includes(id));
      return res.status(400).json({ 
        error: 'Some hosts not found',
        missingHostIds: missingIds
      });
    }

    // Bulk update host groups
    const updateResult = await prisma.host.updateMany({
      where: { id: { in: hostIds } },
      data: {
        hostGroupId: hostGroupId || null
      }
    });

    // Get updated hosts with group information
    const updatedHosts = await prisma.host.findMany({
      where: { id: { in: hostIds } },
      select: {
        id: true,
        hostname: true,
        hostGroup: {
          select: {
            id: true,
            name: true,
            color: true
          }
        }
      }
    });

    res.json({
      message: `Successfully updated ${updateResult.count} host${updateResult.count !== 1 ? 's' : ''}`,
      updatedCount: updateResult.count,
      hosts: updatedHosts
    });
  } catch (error) {
    console.error('Bulk host group update error:', error);
    res.status(500).json({ error: 'Failed to update host groups' });
  }
});

// Admin endpoint to update host group
router.put('/:hostId/group', authenticateToken, requireManageHosts, [
  body('hostGroupId').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { hostId } = req.params;
    const { hostGroupId } = req.body;

    // Check if host exists
    const host = await prisma.host.findUnique({
      where: { id: hostId }
    });

    if (!host) {
      return res.status(404).json({ error: 'Host not found' });
    }

    // If hostGroupId is provided, verify the group exists
    if (hostGroupId) {
      const hostGroup = await prisma.hostGroup.findUnique({
        where: { id: hostGroupId }
      });

      if (!hostGroup) {
        return res.status(400).json({ error: 'Host group not found' });
      }
    }

    // Update host group
    const updatedHost = await prisma.host.update({
      where: { id: hostId },
      data: {
        hostGroupId: hostGroupId || null
      },
      include: {
        hostGroup: {
          select: {
            id: true,
            name: true,
            color: true
          }
        }
      }
    });

    res.json({
      message: 'Host group updated successfully',
      host: updatedHost
    });
  } catch (error) {
    console.error('Host group update error:', error);
    res.status(500).json({ error: 'Failed to update host group' });
  }
});

// Admin endpoint to list all hosts
router.get('/admin/list', authenticateToken, requireManageHosts, async (req, res) => {
  try {
    const hosts = await prisma.host.findMany({
      select: {
        id: true,
        hostname: true,
        ip: true,
        osType: true,
        osVersion: true,
        architecture: true,
        lastUpdate: true,
        status: true,
        apiId: true,
        agentVersion: true,
        autoUpdate: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(hosts);
  } catch (error) {
    console.error('List hosts error:', error);
    res.status(500).json({ error: 'Failed to fetch hosts' });
  }
});

// Admin endpoint to delete host
router.delete('/:hostId', authenticateToken, requireManageHosts, async (req, res) => {
  try {
    const { hostId } = req.params;
    
    // Delete host and all related data (cascade)
    await prisma.host.delete({
      where: { id: hostId }
    });

    res.json({ message: 'Host deleted successfully' });
  } catch (error) {
    console.error('Host deletion error:', error);
    res.status(500).json({ error: 'Failed to delete host' });
  }
});

// Toggle host auto-update setting
router.patch('/:hostId/auto-update', authenticateToken, requireManageHosts, [
  body('autoUpdate').isBoolean().withMessage('Auto-update must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { hostId } = req.params;
    const { autoUpdate } = req.body;

    const host = await prisma.host.update({
      where: { id: hostId },
      data: { autoUpdate }
    });

    res.json({
      message: `Host auto-update ${autoUpdate ? 'enabled' : 'disabled'} successfully`,
      host: {
        id: host.id,
        hostname: host.hostname,
        autoUpdate: host.autoUpdate
      }
    });
  } catch (error) {
    console.error('Host auto-update toggle error:', error);
    res.status(500).json({ error: 'Failed to toggle host auto-update' });
  }
});

// Serve the installation script
router.get('/install', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const scriptPath = path.join(__dirname, '../../../agents/patchmon_install.sh');
    
    if (!fs.existsSync(scriptPath)) {
      return res.status(404).json({ error: 'Installation script not found' });
    }
    
    let script = fs.readFileSync(scriptPath, 'utf8');
    
    // Get the configured server URL from settings
    try {
      const settings = await prisma.settings.findFirst();
      if (settings) {
        // Replace the default server URL in the script with the configured one
        script = script.replace(
          /PATCHMON_URL="[^"]*"/g,
          `PATCHMON_URL="${settings.serverUrl}"`
        );
      }
    } catch (settingsError) {
      console.warn('Could not fetch settings, using default server URL:', settingsError.message);
    }
    
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'inline; filename="patchmon_install.sh"');
    res.send(script);
  } catch (error) {
    console.error('Installation script error:', error);
    res.status(500).json({ error: 'Failed to serve installation script' });
  }
});

// ==================== AGENT VERSION MANAGEMENT ====================

// Get all agent versions (admin only)
router.get('/agent/versions', authenticateToken, requireManageSettings, async (req, res) => {
  try {
    const versions = await prisma.agentVersion.findMany({
      orderBy: { createdAt: 'desc' }
    });

    res.json(versions);
  } catch (error) {
    console.error('Get agent versions error:', error);
    res.status(500).json({ error: 'Failed to get agent versions' });
  }
});

// Create new agent version (admin only)
router.post('/agent/versions', authenticateToken, requireManageSettings, [
  body('version').isLength({ min: 1 }).withMessage('Version is required'),
  body('releaseNotes').optional().isString(),
  body('downloadUrl').optional().isURL().withMessage('Download URL must be valid'),
  body('minServerVersion').optional().isString(),
  body('scriptContent').optional().isString(),
  body('isDefault').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { version, releaseNotes, downloadUrl, minServerVersion, scriptContent, isDefault } = req.body;

    // Check if version already exists
    const existingVersion = await prisma.agentVersion.findUnique({
      where: { version }
    });

    if (existingVersion) {
      return res.status(400).json({ error: 'Version already exists' });
    }

    // If this is being set as default, unset other defaults
    if (isDefault) {
      await prisma.agentVersion.updateMany({
        where: { isDefault: true },
        data: { isDefault: false }
      });
    }

    const agentVersion = await prisma.agentVersion.create({
      data: {
        version,
        releaseNotes,
        downloadUrl,
        minServerVersion,
        scriptContent,
        isDefault: isDefault || false,
        isCurrent: false
      }
    });

    res.status(201).json(agentVersion);
  } catch (error) {
    console.error('Create agent version error:', error);
    res.status(500).json({ error: 'Failed to create agent version' });
  }
});

// Set current agent version (admin only)
router.patch('/agent/versions/:versionId/current', authenticateToken, requireManageSettings, async (req, res) => {
  try {
    const { versionId } = req.params;

    // First, unset all current versions
    await prisma.agentVersion.updateMany({
      where: { isCurrent: true },
      data: { isCurrent: false }
    });

    // Set the specified version as current
    const agentVersion = await prisma.agentVersion.update({
      where: { id: versionId },
      data: { isCurrent: true }
    });

    res.json(agentVersion);
  } catch (error) {
    console.error('Set current agent version error:', error);
    res.status(500).json({ error: 'Failed to set current agent version' });
  }
});

// Set default agent version (admin only)
router.patch('/agent/versions/:versionId/default', authenticateToken, requireManageSettings, async (req, res) => {
  try {
    const { versionId } = req.params;

    // First, unset all default versions
    await prisma.agentVersion.updateMany({
      where: { isDefault: true },
      data: { isDefault: false }
    });

    // Set the specified version as default
    const agentVersion = await prisma.agentVersion.update({
      where: { id: versionId },
      data: { isDefault: true }
    });

    res.json(agentVersion);
  } catch (error) {
    console.error('Set default agent version error:', error);
    res.status(500).json({ error: 'Failed to set default agent version' });
  }
});

// Delete agent version (admin only)
router.delete('/agent/versions/:versionId', authenticateToken, requireManageSettings, async (req, res) => {
  try {
    const { versionId } = req.params;

    const agentVersion = await prisma.agentVersion.findUnique({
      where: { id: versionId }
    });

    if (!agentVersion) {
      return res.status(404).json({ error: 'Agent version not found' });
    }

    if (agentVersion.isCurrent) {
      return res.status(400).json({ error: 'Cannot delete current agent version' });
    }

    await prisma.agentVersion.delete({
      where: { id: versionId }
    });

    res.json({ message: 'Agent version deleted successfully' });
  } catch (error) {
    console.error('Delete agent version error:', error);
    res.status(500).json({ error: 'Failed to delete agent version' });
  }
});

module.exports = router; 