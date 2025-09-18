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
    const currentVersion = '1.2.4';
    
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
    // Get GitHub repo URL from settings
    const settings = await prisma.settings.findFirst();
    console.log('Settings retrieved for version check:', {
      id: settings?.id,
      githubRepoUrl: settings?.githubRepoUrl,
      repositoryType: settings?.repositoryType
    });
    
    if (!settings || !settings.githubRepoUrl) {
      return res.status(400).json({ error: 'GitHub repository URL not configured' });
    }

    // Extract owner and repo from GitHub URL
    // Support both SSH and HTTPS formats:
    // git@github.com:owner/repo.git
    // https://github.com/owner/repo.git
    const repoUrl = settings.githubRepoUrl;
    console.log('Using repository URL:', repoUrl);
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

    console.log('Extracted owner and repo:', { owner, repo });
    
    if (!owner || !repo) {
      return res.status(400).json({ error: 'Invalid GitHub repository URL format' });
    }

    // Determine repository type and set up appropriate access method
    const repositoryType = settings.repositoryType || 'public';
    const isPrivate = repositoryType === 'private';
    
    let latestTag;
    
    if (isPrivate) {
      // Use SSH with deploy keys for private repositories
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
        const { stdout: sshLatestTag } = await execAsync(
          `git ls-remote --tags --sort=-version:refname ${sshRepoUrl} | head -n 1 | sed 's/.*refs\\/tags\\///' | sed 's/\\^{}//'`,
          { 
            timeout: 10000,
            env: env
          }
        );
        
        latestTag = sshLatestTag;
      } catch (sshError) {
        console.error('SSH Git error:', sshError.message);
        throw sshError;
      }
    } else {
      // Use GitHub API for public repositories (no authentication required)
      try {
        const httpsRepoUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
        
        const response = await fetch(httpsRepoUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'PatchMon-Server/1.2.4'
          },
          timeout: 10000
        });
        
        if (!response.ok) {
          throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
        }
        
        const releaseData = await response.json();
        latestTag = releaseData.tag_name;
      } catch (apiError) {
        console.error('GitHub API error:', apiError.message);
        throw apiError;
      }
    }

      const latestVersion = latestTag.trim().replace('v', ''); // Remove 'v' prefix
      const currentVersion = '1.2.4';

      // Simple version comparison (assumes semantic versioning)
      const isUpdateAvailable = compareVersions(latestVersion, currentVersion) > 0;

      res.json({
        currentVersion,
        latestVersion,
        isUpdateAvailable,
        repositoryType,
        latestRelease: {
          tagName: latestTag.trim(),
          version: latestVersion,
          repository: `${owner}/${repo}`,
          accessMethod: isPrivate ? 'ssh' : 'api',
          ...(isPrivate && { sshUrl: `git@github.com:${owner}/${repo}.git`, sshKeyUsed: settings.sshKeyPath })
        }
      });

    } catch (error) {
      console.error('Version check error:', error.message);

      if (error.message.includes('Permission denied') || error.message.includes('Host key verification failed')) {
        return res.status(403).json({
          error: 'Access denied to repository',
          suggestion: isPrivate 
            ? 'Ensure your deploy key is properly configured and has access to the repository. Check that the key has read access to the repository.'
            : 'Check that the repository URL is correct and the repository is public.'
        });
      }

      if (error.message.includes('not found') || error.message.includes('does not exist')) {
        return res.status(404).json({
          error: 'Repository not found',
          suggestion: 'Check that the repository URL is correct and accessible.'
        });
      }

      if (error.message.includes('No SSH deploy key found')) {
        return res.status(400).json({
          error: 'No SSH deploy key found',
          suggestion: 'Please install a deploy key in one of the expected locations: /root/.ssh/, /home/patchmon/.ssh/, or /var/www/.ssh/'
        });
      }

      if (error.message.includes('GitHub API error')) {
        return res.status(500).json({
          error: 'Failed to fetch repository information via GitHub API',
          details: error.message,
          suggestion: 'Check that the repository URL is correct and the repository is public.'
        });
      }

      return res.status(500).json({
        error: 'Failed to fetch repository information',
        details: error.message,
        suggestion: isPrivate 
          ? 'Check deploy key configuration and repository access permissions.'
          : 'Check repository URL and ensure it is accessible.'
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
