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

    // Use SSH to fetch latest tag from private repository
    const sshRepoUrl = `git@github.com:${owner}/${repo}.git`;
    
    try {
      // Fetch the latest tag using SSH
      const { stdout: latestTag } = await execAsync(
        `git ls-remote --tags --sort=-version:refname ${sshRepoUrl} | head -n 1 | sed 's/.*refs\\/tags\\///' | sed 's/\\^\\{\\}//'`,
        { timeout: 10000 }
      );

      const latestVersion = latestTag.trim().replace('v', ''); // Remove 'v' prefix
      const currentVersion = '1.2.3';

      // Simple version comparison (assumes semantic versioning)
      const isUpdateAvailable = compareVersions(latestVersion, currentVersion) > 0;

      // Get additional tag information
      let tagInfo = {};
      try {
        const { stdout: tagDetails } = await execAsync(
          `git ls-remote --tags ${sshRepoUrl} | grep "${latestTag.trim()}" | head -n 1`,
          { timeout: 5000 }
        );
        
        // Extract commit hash and other details if needed
        const parts = tagDetails.trim().split('\t');
        if (parts.length >= 2) {
          tagInfo.commitHash = parts[0];
        }
      } catch (tagDetailError) {
        console.warn('Could not fetch tag details:', tagDetailError.message);
      }

      res.json({
        currentVersion,
        latestVersion,
        isUpdateAvailable,
        latestRelease: {
          tagName: latestTag.trim(),
          version: latestVersion,
          commitHash: tagInfo.commitHash,
          repository: `${owner}/${repo}`,
          sshUrl: sshRepoUrl
        }
      });

    } catch (sshError) {
      console.error('SSH Git error:', sshError.message);
      
      // Check if it's a permission/access issue
      if (sshError.message.includes('Permission denied') || sshError.message.includes('Host key verification failed')) {
        return res.status(403).json({ 
          error: 'SSH access denied to repository',
          suggestion: 'Ensure your SSH key is properly configured and has access to the repository. Check your ~/.ssh/config and known_hosts.'
        });
      }
      
      if (sshError.message.includes('not found') || sshError.message.includes('does not exist')) {
        return res.status(404).json({ 
          error: 'Repository not found',
          suggestion: 'Check that the repository URL is correct and accessible.'
        });
      }

      return res.status(500).json({ 
        error: 'Failed to fetch repository information',
        details: sshError.message,
        suggestion: 'Check SSH key configuration and repository access permissions.'
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
