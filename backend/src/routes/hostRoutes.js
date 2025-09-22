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
        const {version} = req.query;

        let agentVersion;

        if (version) {
            // Download specific version
            agentVersion = await prisma.agent_versions.findUnique({
                where: {version}
            });

            if (!agentVersion) {
                return res.status(404).json({error: 'Agent version not found'});
            }
        } else {
            // Download current version (latest)
            agentVersion = await prisma.agent_versions.findFirst({
                where: {is_current: true},
                orderBy: {created_at: 'desc'}
            });

            if (!agentVersion) {
                // Fallback to default version
                agentVersion = await prisma.agent_versions.findFirst({
                    where: {is_default: true},
                    orderBy: {created_at: 'desc'}
                });
            }
        }

        if (!agentVersion) {
            return res.status(404).json({error: 'No agent version available'});
        }

        // Use script content from database if available, otherwise fallback to file
        if (agentVersion.script_content) {
            // Convert Windows line endings to Unix line endings
            const scriptContent = agentVersion.script_content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            res.setHeader('Content-Type', 'application/x-shellscript');
            res.setHeader('Content-Disposition', `attachment; filename="patchmon-agent-${agentVersion.version}.sh"`);
            res.send(scriptContent);
        } else {
            // Fallback to file system
            const agentPath = path.join(__dirname, '../../../agents/patchmon-agent.sh');
            if (!fs.existsSync(agentPath)) {
                return res.status(404).json({error: 'Agent script not found'});
            }
            // Read file and convert line endings
            const scriptContent = fs.readFileSync(agentPath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            res.setHeader('Content-Type', 'application/x-shellscript');
            res.setHeader('Content-Disposition', `attachment; filename="patchmon-agent-${agentVersion.version}.sh"`);
            res.send(scriptContent);
        }
    } catch (error) {
        console.error('Agent download error:', error);
    }
});

// Version check endpoint for agents
router.get('/agent/version', async (req, res) => {
  try {
    const currentVersion = await prisma.agent_versions.findFirst({
      where: { is_current: true },
      orderBy: { created_at: 'desc' }
    });

    if (!currentVersion) {
      return res.status(404).json({ error: 'No current agent version found' });
    }

    res.json({
      currentVersion: currentVersion.version,
      downloadUrl: currentVersion.download_url || `/api/v1/hosts/agent/download`,
      releaseNotes: currentVersion.release_notes,
      minServerVersion: currentVersion.min_server_version
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

    const host = await prisma.hosts.findFirst({
      where: { 
        api_id: apiId,
        api_key: apiKey
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
  body('friendly_name').isLength({ min: 1 }).withMessage('Friendly name is required'),
  body('hostGroupId').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { friendly_name, hostGroupId } = req.body;
    
    // Generate unique API credentials for this host
    const { apiId, apiKey } = generateApiCredentials();
    
    // Check if host already exists
    const existingHost = await prisma.hosts.findUnique({
      where: { friendly_name: friendly_name }
    });

    if (existingHost) {
      return res.status(409).json({ error: 'Host already exists' });
    }

    // If hostGroupId is provided, verify the group exists
    if (hostGroupId) {
      const hostGroup = await prisma.host_groups.findUnique({
        where: { id: hostGroupId }
      });

      if (!hostGroup) {
        return res.status(400).json({ error: 'Host group not found' });
      }
    }

    // Create new host with API credentials - system info will be populated when agent connects
    const host = await prisma.hosts.create({
      data: {
        id: uuidv4(),
        friendly_name: friendly_name,
        os_type: 'unknown', // Will be updated when agent connects
        os_version: 'unknown', // Will be updated when agent connects
        ip: null, // Will be updated when agent connects
        architecture: null, // Will be updated when agent connects
        api_id: apiId,
        api_key: apiKey,
        host_group_id: hostGroupId || null,
        status: 'pending', // Will change to 'active' when agent connects
        updated_at: new Date()
      },
      include: {
        host_groups: {
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
      friendlyName: host.friendly_name,
      apiId: host.api_id,
      apiKey: host.api_key,
      hostGroup: host.host_groups,
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
  body('agentVersion').optional().isLength({ min: 1 }).withMessage('Agent version must be a non-empty string'),
  // Hardware Information
  body('cpuModel').optional().isString().withMessage('CPU model must be a string'),
  body('cpuCores').optional().isInt({ min: 1 }).withMessage('CPU cores must be a positive integer'),
  body('ramInstalled').optional().isInt({ min: 1 }).withMessage('RAM installed must be a positive integer'),
  body('swapSize').optional().isInt({ min: 0 }).withMessage('Swap size must be a non-negative integer'),
  body('diskDetails').optional().isArray().withMessage('Disk details must be an array'),
  // Network Information
  body('gatewayIp').optional().isIP().withMessage('Gateway IP must be a valid IP address'),
  body('dnsServers').optional().isArray().withMessage('DNS servers must be an array'),
  body('networkInterfaces').optional().isArray().withMessage('Network interfaces must be an array'),
  // System Information
  body('kernelVersion').optional().isString().withMessage('Kernel version must be a string'),
  body('selinuxStatus').optional().isIn(['enabled', 'disabled', 'permissive']).withMessage('SELinux status must be enabled, disabled, or permissive'),
  body('systemUptime').optional().isString().withMessage('System uptime must be a string'),
  body('loadAverage').optional().isArray().withMessage('Load average must be an array')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { packages, repositories } = req.body;
    const host = req.hostRecord;

    // Update host last update timestamp and system info if provided
    const updateData = { 
      last_update: new Date(),
      updated_at: new Date()
    };
    
    // Basic system info
    if (req.body.osType) updateData.os_type = req.body.osType;
    if (req.body.osVersion) updateData.os_version = req.body.osVersion;
    if (req.body.hostname) updateData.hostname = req.body.hostname;
    if (req.body.ip) updateData.ip = req.body.ip;
    if (req.body.architecture) updateData.architecture = req.body.architecture;
    if (req.body.agentVersion) updateData.agent_version = req.body.agentVersion;
    
    // Hardware Information
    if (req.body.cpuModel) updateData.cpu_model = req.body.cpuModel;
    if (req.body.cpuCores) updateData.cpu_cores = req.body.cpuCores;
    if (req.body.ramInstalled) updateData.ram_installed = req.body.ramInstalled;
    if (req.body.swapSize !== undefined) updateData.swap_size = req.body.swapSize;
    if (req.body.diskDetails) updateData.disk_details = req.body.diskDetails;
    
    // Network Information
    if (req.body.gatewayIp) updateData.gateway_ip = req.body.gatewayIp;
    if (req.body.dnsServers) updateData.dns_servers = req.body.dnsServers;
    if (req.body.networkInterfaces) updateData.network_interfaces = req.body.networkInterfaces;
    
    // System Information
    if (req.body.kernelVersion) updateData.kernel_version = req.body.kernelVersion;
    if (req.body.selinuxStatus) updateData.selinux_status = req.body.selinuxStatus;
    if (req.body.systemUptime) updateData.system_uptime = req.body.systemUptime;
    if (req.body.loadAverage) updateData.load_average = req.body.loadAverage;
    
    // If this is the first update (status is 'pending'), change to 'active'
    if (host.status === 'pending') {
      updateData.status = 'active';
    }

    await prisma.hosts.update({
      where: { id: host.id },
      data: updateData
    });

    // Process packages in transaction
    await prisma.$transaction(async (tx) => {
      // Clear existing host packages
      await tx.host_packages.deleteMany({
        where: { host_id: host.id }
      });

      // Process each package
      for (const packageData of packages) {
        // Find or create package
        let pkg = await tx.packages.findUnique({
          where: { name: packageData.name }
        });

        if (!pkg) {
          pkg = await tx.packages.create({
            data: {
              id: uuidv4(),
              name: packageData.name,
              description: packageData.description || null,
              category: packageData.category || null,
              latest_version: packageData.availableVersion || packageData.currentVersion,
              updated_at: new Date()
            }
          });
        } else {
          // Update package latest version if newer
          if (packageData.availableVersion && packageData.availableVersion !== pkg.latest_version) {
            await tx.packages.update({
              where: { id: pkg.id },
              data: { 
                latest_version: packageData.availableVersion,
                updated_at: new Date()
              }
            });
          }
        }

        // Create host package relationship
        await tx.host_packages.create({
          data: {
            id: uuidv4(),
            host_id: host.id,
            package_id: pkg.id,
            current_version: packageData.currentVersion,
            available_version: packageData.availableVersion || null,
            needs_update: packageData.needsUpdate,
            is_security_update: packageData.isSecurityUpdate || false,
            last_checked: new Date()
          }
        });
      }

      // Process repositories if provided
      if (repositories && Array.isArray(repositories)) {
        // Clear existing host repositories
        await tx.host_repositories.deleteMany({
          where: { host_id: host.id }
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
          let repo = await tx.repositories.findFirst({
            where: {
              url: repoData.url,
              distribution: repoData.distribution,
              components: repoData.components
            }
          });

          if (!repo) {
            repo = await tx.repositories.create({
              data: {
                id: uuidv4(),
                name: repoData.name,
                url: repoData.url,
                distribution: repoData.distribution,
                components: repoData.components,
                repo_type: repoData.repoType,
                is_active: true,
                is_secure: repoData.isSecure || false,
                description: `${repoData.repoType} repository for ${repoData.distribution}`,
                updated_at: new Date()
              }
            });
          }

          // Create host repository relationship
          await tx.host_repositories.create({
            data: {
              id: uuidv4(),
              host_id: host.id,
              repository_id: repo.id,
              is_enabled: repoData.isEnabled !== false, // Default to enabled
              last_checked: new Date()
            }
          });
        }
      }
    });

    // Create update history record
    const securityCount = packages.filter(pkg => pkg.isSecurityUpdate).length;
    const updatesCount = packages.filter(pkg => pkg.needsUpdate).length;

    await prisma.update_history.create({
      data: {
        id: uuidv4(),
        host_id: host.id,
        packages_count: updatesCount,
        security_count: securityCount,
        status: 'success'
      }
    });

    // Check if auto-update is enabled and if there's a newer agent version available
    let autoUpdateResponse = null;
    try {
      const settings = await prisma.settings.findFirst();
      // Check both global auto-update setting AND host-specific auto-update setting
      if (settings && settings.auto_update && host.auto_update) {
        // Get current agent version from the request
        const currentAgentVersion = req.body.agentVersion;
        
        if (currentAgentVersion) {
          // Get the latest agent version
          const latestAgentVersion = await prisma.agent_versions.findFirst({
            where: { is_current: true },
            orderBy: { created_at: 'desc' }
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
    if (host.auto_update) {
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
      await prisma.update_history.create({
        data: {
          id: uuidv4(),
          host_id: req.hostRecord.id,
          packages_count: 0,
          security_count: 0,
          status: 'error',
          error_message: error.message
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
    const host = await prisma.hosts.findUnique({
      where: { id: req.hostRecord.id },
      select: {
        id: true,
        friendly_name: true,
        hostname: true,
        ip: true,
        os_type: true,
        os_version: true,
        architecture: true,
        last_update: true,
        status: true,
        created_at: true,
        api_id: true // Include API ID for reference
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
    await prisma.hosts.update({
      where: { id: req.hostRecord.id },
      data: { 
        last_update: new Date(),
        updated_at: new Date()
      }
    });

    const response = { 
      message: 'Ping successful',
      timestamp: new Date().toISOString(),
      friendlyName: req.hostRecord.friendly_name
    };

    // Check if this is a crontab update trigger
    if (req.body.triggerCrontabUpdate && req.hostRecord.auto_update) {
      console.log(`Triggering crontab update for host: ${req.hostRecord.friendly_name}`);
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
    
    const host = await prisma.hosts.findUnique({
      where: { id: hostId }
    });

    if (!host) {
      return res.status(404).json({ error: 'Host not found' });
    }

    // Generate new API credentials
    const { apiId, apiKey } = generateApiCredentials();

    // Update host with new credentials
    const updatedHost = await prisma.hosts.update({
      where: { id: hostId },
      data: { 
        api_id: apiId, 
        api_key: apiKey,
        updated_at: new Date()
      }
    });

    res.json({
      message: 'API credentials regenerated successfully',
      hostname: updatedHost.hostname,
      apiId: updatedHost.api_id,
      apiKey: updatedHost.api_key,
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
      const hostGroup = await prisma.host_groups.findUnique({
        where: { id: hostGroupId }
      });

      if (!hostGroup) {
        return res.status(400).json({ error: 'Host group not found' });
      }
    }

    // Check if all hosts exist
    const existingHosts = await prisma.hosts.findMany({
      where: { id: { in: hostIds } },
      select: { id: true, friendly_name: true }
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
    const updateResult = await prisma.hosts.updateMany({
      where: { id: { in: hostIds } },
      data: {
        host_group_id: hostGroupId || null,
        updated_at: new Date()
      }
    });

    // Get updated hosts with group information
    const updatedHosts = await prisma.hosts.findMany({
      where: { id: { in: hostIds } },
      select: {
        id: true,
        friendly_name: true,
        host_groups: {
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
    const host = await prisma.hosts.findUnique({
      where: { id: hostId }
    });

    if (!host) {
      return res.status(404).json({ error: 'Host not found' });
    }

    // If hostGroupId is provided, verify the group exists
    if (hostGroupId) {
      const hostGroup = await prisma.host_groups.findUnique({
        where: { id: hostGroupId }
      });

      if (!hostGroup) {
        return res.status(400).json({ error: 'Host group not found' });
      }
    }

    // Update host group
    const updatedHost = await prisma.hosts.update({
      where: { id: hostId },
      data: {
        host_group_id: hostGroupId || null,
        updated_at: new Date()
      },
      include: {
        host_groups: {
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
    const hosts = await prisma.hosts.findMany({
      select: {
        id: true,
        friendly_name: true,
        hostname: true,
        ip: true,
        os_type: true,
        os_version: true,
        architecture: true,
        last_update: true,
        status: true,
        api_id: true,
        agent_version: true,
        auto_update: true,
        created_at: true,
        host_group_id: true,
        host_groups: {
          select: {
            id: true,
            name: true,
            color: true
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    res.json(hosts);
  } catch (error) {
    console.error('List hosts error:', error);
    res.status(500).json({ error: 'Failed to fetch hosts' });
  }
});

// Admin endpoint to delete multiple hosts
router.delete('/bulk', authenticateToken, requireManageHosts, [
  body('hostIds').isArray({ min: 1 }).withMessage('At least one host ID is required'),
  body('hostIds.*').isLength({ min: 1 }).withMessage('Each host ID must be provided')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { hostIds } = req.body;
    
    // Verify all hosts exist before deletion
    const existingHosts = await prisma.hosts.findMany({
      where: { id: { in: hostIds } },
      select: { id: true, friendly_name: true }
    });

    if (existingHosts.length !== hostIds.length) {
      const foundIds = existingHosts.map(h => h.id);
      const missingIds = hostIds.filter(id => !foundIds.includes(id));
      return res.status(404).json({ 
        error: 'Some hosts not found', 
        missingIds 
      });
    }

    // Delete all hosts (cascade will handle related data)
    const deleteResult = await prisma.hosts.deleteMany({
      where: { id: { in: hostIds } }
    });

    // Check if all hosts were actually deleted
    if (deleteResult.count !== hostIds.length) {
      console.warn(`Expected to delete ${hostIds.length} hosts, but only deleted ${deleteResult.count}`);
    }

    res.json({ 
      message: `${deleteResult.count} host${deleteResult.count !== 1 ? 's' : ''} deleted successfully`,
      deletedCount: deleteResult.count,
      requestedCount: hostIds.length,
      deletedHosts: existingHosts.map(h => ({ id: h.id, friendly_name: h.friendly_name }))
    });
  } catch (error) {
    console.error('Bulk host deletion error:', error);
    
    // Handle specific Prisma errors
    if (error.code === 'P2025') {
      return res.status(404).json({ 
        error: 'Some hosts were not found or already deleted',
        details: 'The hosts may have been deleted by another process or do not exist'
      });
    }
    
    if (error.code === 'P2003') {
      return res.status(400).json({ 
        error: 'Cannot delete hosts due to foreign key constraints',
        details: 'Some hosts have related data that prevents deletion'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to delete hosts',
      details: error.message || 'An unexpected error occurred'
    });
  }
});

// Admin endpoint to delete host
router.delete('/:hostId', authenticateToken, requireManageHosts, async (req, res) => {
  try {
    const { hostId } = req.params;
    
    // Check if host exists first
    const existingHost = await prisma.hosts.findUnique({
      where: { id: hostId },
      select: { id: true, friendly_name: true }
    });

    if (!existingHost) {
      return res.status(404).json({ 
        error: 'Host not found',
        details: 'The host may have been deleted or does not exist'
      });
    }
    
    // Delete host and all related data (cascade)
    await prisma.hosts.delete({
      where: { id: hostId }
    });

    res.json({ 
      message: 'Host deleted successfully',
      deletedHost: { id: existingHost.id, friendly_name: existingHost.friendly_name }
    });
  } catch (error) {
    console.error('Host deletion error:', error);
    
    // Handle specific Prisma errors
    if (error.code === 'P2025') {
      return res.status(404).json({ 
        error: 'Host not found',
        details: 'The host may have been deleted or does not exist'
      });
    }
    
    if (error.code === 'P2003') {
      return res.status(400).json({ 
        error: 'Cannot delete host due to foreign key constraints',
        details: 'The host has related data that prevents deletion'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to delete host',
      details: error.message || 'An unexpected error occurred'
    });
  }
});

// Toggle host auto-update setting
router.patch('/:hostId/auto-update', authenticateToken, requireManageHosts, [
  body('auto_update').isBoolean().withMessage('Auto-update must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { hostId } = req.params;
    const { auto_update } = req.body;

    const host = await prisma.hosts.update({
      where: { id: hostId },
      data: { 
        auto_update: auto_update,
        updated_at: new Date()
      }
    });

    res.json({
      message: `Host auto-update ${autoUpdate ? 'enabled' : 'disabled'} successfully`,
      host: {
        id: host.id,
        friendlyName: host.friendly_name,
        autoUpdate: host.auto_update
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

    const scriptPath = path.join(__dirname, '../../agents/patchmon_install.sh');
    
    if (!fs.existsSync(scriptPath)) {
      return res.status(404).json({ error: 'Installation script not found' });
    }

      let script = fs.readFileSync(scriptPath, 'utf8');

// Convert Windows line endings to Unix line endings
      script = script.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

// Get the configured server URL from settings
      try {
          const settings = await prisma.settings.findFirst();
          if (settings) {
              // Replace the default server URL in the script with the configured one
              script = script.replace(
                  /PATCHMON_URL="[^"]*"/g,
                  `PATCHMON_URL="${settings.server_url}"`
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
    const versions = await prisma.agent_versions.findMany({
      orderBy: { created_at: 'desc' }
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
    const existingVersion = await prisma.agent_versions.findUnique({
      where: { version }
    });

    if (existingVersion) {
      return res.status(400).json({ error: 'Version already exists' });
    }

    // If this is being set as default, unset other defaults
    if (isDefault) {
      await prisma.agent_versions.updateMany({
        where: { is_default: true },
        data: { 
          is_default: false,
          updated_at: new Date()
        }
      });
    }

    const agentVersion = await prisma.agent_versions.create({
      data: {
        id: uuidv4(),
        version,
        release_notes: releaseNotes,
        download_url: downloadUrl,
        min_server_version: minServerVersion,
        script_content: scriptContent,
        is_default: isDefault || false,
        is_current: false,
        updated_at: new Date()
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
    await prisma.agent_versions.updateMany({
      where: { is_current: true },
      data: { is_current: false, updated_at: new Date() }
    });

    // Set the specified version as current
    const agentVersion = await prisma.agent_versions.update({
      where: { id: versionId },
      data: { is_current: true, updated_at: new Date() }
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
    await prisma.agent_versions.updateMany({
      where: { is_default: true },
      data: { is_default: false, updated_at: new Date() }
    });

    // Set the specified version as default
    const agentVersion = await prisma.agent_versions.update({
      where: { id: versionId },
      data: { is_default: true, updated_at: new Date() }
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

    const agentVersion = await prisma.agent_versions.findUnique({
      where: { id: versionId }
    });

    if (!agentVersion) {
      return res.status(404).json({ error: 'Agent version not found' });
    }

    if (agentVersion.is_current) {
      return res.status(400).json({ error: 'Cannot delete current agent version' });
    }

    await prisma.agent_versions.delete({
      where: { id: versionId }
    });

    res.json({ message: 'Agent version deleted successfully' });
  } catch (error) {
    console.error('Delete agent version error:', error);
    res.status(500).json({ error: 'Failed to delete agent version' });
  }
});

// Update host friendly name (admin only)
router.patch('/:hostId/friendly-name', authenticateToken, requireManageHosts, [
  body('friendly_name').isLength({ min: 1, max: 100 }).withMessage('Friendly name must be between 1 and 100 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { hostId } = req.params;
    const { friendly_name } = req.body;

    // Check if host exists
    const host = await prisma.hosts.findUnique({
      where: { id: hostId }
    });

    if (!host) {
      return res.status(404).json({ error: 'Host not found' });
    }

    // Check if friendly name is already taken by another host
    const existingHost = await prisma.hosts.findFirst({
      where: {
        friendly_name: friendly_name,
        id: { not: hostId }
      }
    });

    if (existingHost) {
      return res.status(400).json({ error: 'Friendly name is already taken by another host' });
    }

    // Update the friendly name
    const updatedHost = await prisma.hosts.update({
      where: { id: hostId },
      data: { friendly_name: friendly_name },
      select: {
        id: true,
        friendly_name: true,
        hostname: true,
        ip: true,
        os_type: true,
        os_version: true,
        architecture: true,
        last_update: true,
        status: true,
        host_group_id: true,
        agent_version: true,
        auto_update: true,
        created_at: true,
        updated_at: true,
        host_groups: {
          select: {
            id: true,
            name: true,
            color: true
          }
        }
      }
    });

    res.json({
      message: 'Friendly name updated successfully',
      host: updatedHost
    });
  } catch (error) {
    console.error('Update friendly name error:', error);
    res.status(500).json({ error: 'Failed to update friendly name' });
  }
});

module.exports = router; 