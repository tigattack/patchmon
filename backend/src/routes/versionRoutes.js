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
    const currentVersion = '1.2.3';
    
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

// Check for updates from GitHub
router.get('/check-updates', authenticateToken, requireManageSettings, async (req, res) => {
  try {
    // Get GitHub repo URL from settings
    const settings = await prisma.settings.findFirst();
    if (!settings || !settings.githubRepoUrl) {
      return res.status(400).json({ error: 'GitHub repository URL not configured' });
    }

    // Extract owner and repo from GitHub URL
    // Support both SSH and HTTPS formats:
    // git@github.com:owner/repo.git
    // https://github.com/owner/repo.git
    const repoUrl = settings.githubRepoUrl;
    let owner, repo;
    
    if (repoUrl.includes('git@github.com:')) {
      const match = repoUrl.match(/git@github\.com:([^\/]+)\/([^\/]+)\.git/);
      if (match) {
        [, owner, repo] = match;
      }
    } else if (repoUrl.includes('github.com/')) {
      const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (match) {
        [, owner, repo] = match;
      }
    }

    if (!owner || !repo) {
      return res.status(400).json({ error: 'Invalid GitHub repository URL format' });
    }

    // Use SSH with deploy keys (secure approach)
    const sshRepoUrl = `git@github.com:${owner}/${repo}.git`;
    
    try {
      let sshKeyPath = null;
      
      // First, try to use the configured SSH key path from settings
      if (settings.sshKeyPath) {
        try {
          require('fs').accessSync(settings.sshKeyPath);
          sshKeyPath = settings.sshKeyPath;
          console.log(`Using configured SSH key at: ${sshKeyPath}`);
        } catch (e) {
          console.warn(`Configured SSH key path not accessible: ${settings.sshKeyPath}`);
        }
      }
      
      // If no configured path or it's not accessible, try common locations
      if (!sshKeyPath) {
        const possibleKeyPaths = [
          '/root/.ssh/id_ed25519',           // Root user (if service runs as root)
          '/root/.ssh/id_rsa',               // Root user RSA key
          '/home/patchmon/.ssh/id_ed25519',  // PatchMon user
          '/home/patchmon/.ssh/id_rsa',      // PatchMon user RSA key
          '/var/www/.ssh/id_ed25519',        // Web user
          '/var/www/.ssh/id_rsa'             // Web user RSA key
        ];
        
        for (const path of possibleKeyPaths) {
          try {
            require('fs').accessSync(path);
            sshKeyPath = path;
            console.log(`Found SSH key at: ${path}`);
            break;
          } catch (e) {
            // Key not found at this path, try next
          }
        }
      }
      
      if (!sshKeyPath) {
        throw new Error('No SSH deploy key found. Please configure the SSH key path in settings or ensure a deploy key is installed in one of the expected locations.');
      }
      
      const env = {
        ...process.env,
        GIT_SSH_COMMAND: `ssh -i ${sshKeyPath} -o StrictHostKeyChecking=no -o IdentitiesOnly=yes`
      };

      // Fetch the latest tag using SSH with deploy key
      const { stdout: latestTag } = await execAsync(
        `git ls-remote --tags --sort=-version:refname ${sshRepoUrl} | head -n 1 | sed 's/.*refs\\/tags\\///' | sed 's/\\^{}//'`,
        { 
          timeout: 10000,
          env: env
        }
      );

      const latestVersion = latestTag.trim().replace('v', ''); // Remove 'v' prefix
      const currentVersion = '1.2.3';

      // Simple version comparison (assumes semantic versioning)
      const isUpdateAvailable = compareVersions(latestVersion, currentVersion) > 0;

      res.json({
        currentVersion,
        latestVersion,
        isUpdateAvailable,
        latestRelease: {
          tagName: latestTag.trim(),
          version: latestVersion,
          repository: `${owner}/${repo}`,
          sshUrl: sshRepoUrl,
          sshKeyUsed: sshKeyPath
        }
      });

    } catch (sshError) {
      console.error('SSH Git error:', sshError.message);

      if (sshError.message.includes('Permission denied') || sshError.message.includes('Host key verification failed')) {
        return res.status(403).json({
          error: 'SSH access denied to repository',
          suggestion: 'Ensure your deploy key is properly configured and has access to the repository. Check that the key has read access to the repository.'
        });
      }

      if (sshError.message.includes('not found') || sshError.message.includes('does not exist')) {
        return res.status(404).json({
          error: 'Repository not found',
          suggestion: 'Check that the repository URL is correct and accessible with the deploy key.'
        });
      }

      if (sshError.message.includes('No SSH deploy key found')) {
        return res.status(400).json({
          error: 'No SSH deploy key found',
          suggestion: 'Please install a deploy key in one of the expected locations: /root/.ssh/, /home/patchmon/.ssh/, or /var/www/.ssh/'
        });
      }

      return res.status(500).json({
        error: 'Failed to fetch repository information',
        details: sshError.message,
        suggestion: 'Check deploy key configuration and repository access permissions.'
      });
    }

  } catch (error) {
    console.error('Error checking for updates:', error);
    res.status(500).json({ 
      error: 'Failed to check for updates',
      details: error.message 
    });
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
