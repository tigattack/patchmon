const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middleware/auth');
const { requireViewHosts, requireManageHosts } = require('../middleware/permissions');

const router = express.Router();
const prisma = new PrismaClient();

// Get all repositories with host count
router.get('/', authenticateToken, requireViewHosts, async (req, res) => {
  try {
    const repositories = await prisma.repository.findMany({
      include: {
        hostRepositories: {
          include: {
            host: {
              select: {
                id: true,
                friendlyName: true,
                status: true
              }
            }
          }
        },
        _count: {
          select: {
            hostRepositories: true
          }
        }
      },
      orderBy: [
        { name: 'asc' },
        { url: 'asc' }
      ]
    });

    // Transform data to include host counts and status
    const transformedRepos = repositories.map(repo => ({
      ...repo,
      hostCount: repo._count.hostRepositories,
      enabledHostCount: repo.hostRepositories.filter(hr => hr.isEnabled).length,
      activeHostCount: repo.hostRepositories.filter(hr => hr.host.status === 'active').length,
      hosts: repo.hostRepositories.map(hr => ({
        id: hr.host.id,
        friendlyName: hr.host.friendlyName,
        status: hr.host.status,
        isEnabled: hr.isEnabled,
        lastChecked: hr.lastChecked
      }))
    }));

    res.json(transformedRepos);
  } catch (error) {
    console.error('Repository list error:', error);
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});

// Get repositories for a specific host
router.get('/host/:hostId', authenticateToken, requireViewHosts, async (req, res) => {
  try {
    const { hostId } = req.params;

    const hostRepositories = await prisma.hostRepository.findMany({
      where: { hostId },
      include: {
        repository: true,
        host: {
          select: {
            id: true,
            friendlyName: true
          }
        }
      },
      orderBy: {
        repository: {
          name: 'asc'
        }
      }
    });

    res.json(hostRepositories);
  } catch (error) {
    console.error('Host repositories error:', error);
    res.status(500).json({ error: 'Failed to fetch host repositories' });
  }
});

// Get repository details with all hosts
router.get('/:repositoryId', authenticateToken, requireViewHosts, async (req, res) => {
  try {
    const { repositoryId } = req.params;

    const repository = await prisma.repository.findUnique({
      where: { id: repositoryId },
      include: {
        hostRepositories: {
          include: {
            host: {
              select: {
                id: true,
                friendlyName: true,
                hostname: true,
                ip: true,
                osType: true,
                osVersion: true,
                status: true,
                lastUpdate: true
              }
            }
          },
          orderBy: {
            host: {
              friendlyName: 'asc'
            }
          }
        }
      }
    });

    if (!repository) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    res.json(repository);
  } catch (error) {
    console.error('Repository detail error:', error);
    res.status(500).json({ error: 'Failed to fetch repository details' });
  }
});

// Update repository information (admin only)
router.put('/:repositoryId', authenticateToken, requireManageHosts, [
  body('name').optional().isLength({ min: 1 }).withMessage('Name is required'),
  body('description').optional(),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  body('priority').optional().isInt({ min: 0 }).withMessage('Priority must be a positive integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { repositoryId } = req.params;
    const { name, description, isActive, priority } = req.body;

    const repository = await prisma.repository.update({
      where: { id: repositoryId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
        ...(priority !== undefined && { priority })
      },
      include: {
        _count: {
          select: {
            hostRepositories: true
          }
        }
      }
    });

    res.json(repository);
  } catch (error) {
    console.error('Repository update error:', error);
    res.status(500).json({ error: 'Failed to update repository' });
  }
});

// Toggle repository status for a specific host
router.patch('/host/:hostId/repository/:repositoryId', authenticateToken, requireManageHosts, [
  body('isEnabled').isBoolean().withMessage('isEnabled must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { hostId, repositoryId } = req.params;
    const { isEnabled } = req.body;

    const hostRepository = await prisma.hostRepository.update({
      where: {
        hostId_repositoryId: {
          hostId,
          repositoryId
        }
      },
      data: {
        isEnabled,
        lastChecked: new Date()
      },
      include: {
        repository: true,
        host: {
          select: {
            friendlyName: true
          }
        }
      }
    });

    res.json({
      message: `Repository ${isEnabled ? 'enabled' : 'disabled'} for host ${hostRepository.host.friendlyName}`,
      hostRepository
    });
  } catch (error) {
    console.error('Host repository toggle error:', error);
    res.status(500).json({ error: 'Failed to toggle repository status' });
  }
});

// Get repository statistics
router.get('/stats/summary', authenticateToken, requireViewHosts, async (req, res) => {
  try {
    const stats = await prisma.repository.aggregate({
      _count: true
    });

    const hostRepoStats = await prisma.hostRepository.aggregate({
      _count: {
        isEnabled: true
      },
      where: {
        isEnabled: true
      }
    });

    const secureRepos = await prisma.repository.count({
      where: { isSecure: true }
    });

    const activeRepos = await prisma.repository.count({
      where: { isActive: true }
    });

    res.json({
      totalRepositories: stats._count,
      activeRepositories: activeRepos,
      secureRepositories: secureRepos,
      enabledHostRepositories: hostRepoStats._count.isEnabled,
      securityPercentage: stats._count > 0 ? Math.round((secureRepos / stats._count) * 100) : 0
    });
  } catch (error) {
    console.error('Repository stats error:', error);
    res.status(500).json({ error: 'Failed to fetch repository statistics' });
  }
});

// Cleanup orphaned repositories (admin only)
router.delete('/cleanup/orphaned', authenticateToken, requireManageHosts, async (req, res) => {
  try {
    console.log('Cleaning up orphaned repositories...');
    
    // Find repositories with no host relationships
    const orphanedRepos = await prisma.repository.findMany({
      where: {
        hostRepositories: {
          none: {}
        }
      }
    });

    if (orphanedRepos.length === 0) {
      return res.json({
        message: 'No orphaned repositories found',
        deletedCount: 0,
        deletedRepositories: []
      });
    }

    // Delete orphaned repositories
    const deleteResult = await prisma.repository.deleteMany({
      where: {
        hostRepositories: {
          none: {}
        }
      }
    });

    console.log(`Deleted ${deleteResult.count} orphaned repositories`);

    res.json({
      message: `Successfully deleted ${deleteResult.count} orphaned repositories`,
      deletedCount: deleteResult.count,
      deletedRepositories: orphanedRepos.map(repo => ({
        id: repo.id,
        name: repo.name,
        url: repo.url
      }))
    });
  } catch (error) {
    console.error('Repository cleanup error:', error);
    res.status(500).json({ error: 'Failed to cleanup orphaned repositories' });
  }
});

module.exports = router;
