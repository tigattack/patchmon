const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requireManageSettings } = require('../middleware/permissions');
const { PrismaClient } = require('@prisma/client');
const { exec } = require('child_process');
const { promisify } = require('util');

const prisma = new PrismaClient();
const execAsync = promisify(exec);

const router = express.Router();

// Get current version info
router.get('/current', authenticateToken, async (req, res) => {
  try {
    // For now, return hardcoded version - this should match your agent version
    const currentVersion = '1.2.5';
    
    res.json({
      version: currentVersion,
      buildDate: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    console.error('Error getting current version:', error);
    res.status(500).json({ error: 'Failed to get current version' });
  }
});

// Test SSH key permissions and GitHub access
router.post('/test-ssh-key', authenticateToken, requireManageSettings, async (req, res) => {
  try {
    const { sshKeyPath, githubRepoUrl } = req.body;
    
    if (!sshKeyPath || !githubRepoUrl) {
      return res.status(400).json({ 
        error: 'SSH key path and GitHub repo URL are required' 
      });
    }
    
    // Parse repository info
    let owner, repo;
    if (githubRepoUrl.includes('git@github.com:')) {
      const match = githubRepoUrl.match(/git@github\.com:([^\/]+)\/([^\/]+)\.git/);
      if (match) {
        [, owner, repo] = match;
      }
    } else if (githubRepoUrl.includes('github.com/')) {
      const match = githubRepoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (match) {
        [, owner, repo] = match;
      }
    }
    
    if (!owner || !repo) {
      return res.status(400).json({ 
        error: 'Invalid GitHub repository URL format' 
      });
    }
    
    // Check if SSH key file exists and is readable
    try {
      require('fs').accessSync(sshKeyPath);
    } catch (e) {
      return res.status(400).json({
        error: 'SSH key file not found or not accessible',
        details: `Cannot access: ${sshKeyPath}`,
        suggestion: 'Check the file path and ensure the application has read permissions'
      });
    }
    
    // Test SSH connection to GitHub
    const sshRepoUrl = `git@github.com:${owner}/${repo}.git`;
    const env = {
      ...process.env,
      GIT_SSH_COMMAND: `ssh -i ${sshKeyPath} -o StrictHostKeyChecking=no -o IdentitiesOnly=yes -o ConnectTimeout=10`
    };
    
    try {
      // Test with a simple git command
      const { stdout } = await execAsync(
        `git ls-remote --heads ${sshRepoUrl} | head -n 1`,
        { 
          timeout: 15000,
          env: env
        }
      );
      
      if (stdout.trim()) {
        return res.json({
          success: true,
          message: 'SSH key is working correctly',
          details: {
            sshKeyPath,
            repository: `${owner}/${repo}`,
            testResult: 'Successfully connected to GitHub'
          }
        });
      } else {
        return res.status(400).json({
          error: 'SSH connection succeeded but no data returned',
          suggestion: 'Check repository access permissions'
        });
      }
    } catch (sshError) {
      console.error('SSH test error:', sshError.message);
      
      if (sshError.message.includes('Permission denied')) {
        return res.status(403).json({
          error: 'SSH key permission denied',
          details: 'The SSH key exists but GitHub rejected the connection',
          suggestion: 'Verify the SSH key is added to the repository as a deploy key with read access'
        });
      } else if (sshError.message.includes('Host key verification failed')) {
        return res.status(403).json({
          error: 'Host key verification failed',
          suggestion: 'This is normal for first-time connections. The key will be added to known_hosts automatically.'
        });
      } else if (sshError.message.includes('Connection timed out')) {
        return res.status(408).json({
          error: 'Connection timed out',
          suggestion: 'Check your internet connection and GitHub status'
        });
      } else {
        return res.status(500).json({
          error: 'SSH connection failed',
          details: sshError.message,
          suggestion: 'Check the SSH key format and repository URL'
        });
      }
    }
    
  } catch (error) {
    console.error('SSH key test error:', error);
    res.status(500).json({
      error: 'Failed to test SSH key',
      details: error.message
    });
  }
});

// Check for updates from GitHub
router.get('/check-updates', authenticateToken, requireManageSettings, async (req, res) => {
  try {
    // Get cached update information from settings
    const settings = await prisma.settings.findFirst();
    
    if (!settings) {
      return res.status(400).json({ error: 'Settings not found' });
    }

    const currentVersion = '1.2.5';
    const latestVersion = settings.latestVersion || currentVersion;
    const isUpdateAvailable = settings.updateAvailable || false;
    const lastUpdateCheck = settings.lastUpdateCheck;

    res.json({
      currentVersion,
      latestVersion,
      isUpdateAvailable,
      lastUpdateCheck,
      repositoryType: settings.repositoryType || 'public',
      latestRelease: {
        tagName: latestVersion ? `v${latestVersion}` : null,
        version: latestVersion,
        repository: settings.githubRepoUrl ? settings.githubRepoUrl.split('/').slice(-2).join('/') : null,
        accessMethod: settings.repositoryType === 'private' ? 'ssh' : 'api'
      }
    });

  } catch (error) {
    console.error('Error getting update information:', error);
    res.status(500).json({ error: 'Failed to get update information' });
  }
});

// Simple version comparison function
function compareVersions(version1, version2) {
  const v1Parts = version1.split('.').map(Number);
  const v2Parts = version2.split('.').map(Number);
  
  const maxLength = Math.max(v1Parts.length, v2Parts.length);
  
  for (let i = 0; i < maxLength; i++) {
    const v1Part = v1Parts[i] || 0;
    const v2Part = v2Parts[i] || 0;
    
    if (v1Part > v2Part) return 1;
    if (v1Part < v2Part) return -1;
  }
  
  return 0;
}

module.exports = router;
