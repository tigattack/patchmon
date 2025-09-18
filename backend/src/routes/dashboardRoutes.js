const express = require('express');
const { PrismaClient } = require('@prisma/client');
const moment = require('moment');
const { authenticateToken } = require('../middleware/auth');
const { 
  requireViewDashboard, 
  requireViewHosts, 
  requireViewPackages 
} = require('../middleware/permissions');

const router = express.Router();
const prisma = new PrismaClient();

// Get dashboard statistics
router.get('/stats', authenticateToken, requireViewDashboard, async (req, res) => {
  try {
    const now = new Date();
    
    // Get the agent update interval setting
    const settings = await prisma.settings.findFirst();
    const updateIntervalMinutes = settings?.updateInterval || 60; // Default to 60 minutes if no setting
    
    // Calculate the threshold based on the actual update interval
    // Use 2x the update interval as the threshold for "errored" hosts
    const thresholdMinutes = updateIntervalMinutes * 2;
    const thresholdTime = moment(now).subtract(thresholdMinutes, 'minutes').toDate();

    // Get all statistics in parallel for better performance
    const [
      totalHosts,
      hostsNeedingUpdates,
      totalOutdatedPackages,
      erroredHosts,
      securityUpdates,
      offlineHosts,
      osDistribution,
      updateTrends
    ] = await Promise.all([
      // Total hosts count
      prisma.host.count({
        where: { status: 'active' }
      }),

      // Hosts needing updates (distinct hosts with packages needing updates)
      prisma.host.count({
        where: {
          status: 'active',
          hostPackages: {
            some: {
              needsUpdate: true
            }
          }
        }
      }),

      // Total outdated packages across all hosts
      prisma.hostPackage.count({
        where: { needsUpdate: true }
      }),

      // Errored hosts (not updated within threshold based on update interval)
      prisma.host.count({
        where: {
          status: 'active',
          lastUpdate: {
            lt: thresholdTime
          }
        }
      }),

      // Security updates count
      prisma.hostPackage.count({
        where: {
          needsUpdate: true,
          isSecurityUpdate: true
        }
      }),

      // Offline/Stale hosts (not updated within 3x the update interval)
      prisma.host.count({
        where: {
          status: 'active',
          lastUpdate: {
            lt: moment(now).subtract(updateIntervalMinutes * 3, 'minutes').toDate()
          }
        }
      }),

      // OS distribution for pie chart
      prisma.host.groupBy({
        by: ['osType'],
        where: { status: 'active' },
        _count: {
          osType: true
        }
      }),

      // Update trends for the last 7 days
      prisma.updateHistory.groupBy({
        by: ['timestamp'],
        where: {
          timestamp: {
            gte: moment(now).subtract(7, 'days').toDate()
          }
        },
        _count: {
          id: true
        },
        _sum: {
          packagesCount: true,
          securityCount: true
        }
      })
    ]);

    // Format OS distribution for pie chart
    const osDistributionFormatted = osDistribution.map(item => ({
      name: item.osType,
      count: item._count.osType
    }));

    // Calculate update status distribution
    const updateStatusDistribution = [
      { name: 'Up to date', count: totalHosts - hostsNeedingUpdates },
      { name: 'Needs updates', count: hostsNeedingUpdates },
      { name: 'Errored', count: erroredHosts }
    ];

    // Package update priority distribution
    const packageUpdateDistribution = [
      { name: 'Security', count: securityUpdates },
      { name: 'Regular', count: totalOutdatedPackages - securityUpdates }
    ];

    res.json({
      cards: {
        totalHosts,
        hostsNeedingUpdates,
        totalOutdatedPackages,
        erroredHosts,
        securityUpdates,
        offlineHosts
      },
      charts: {
        osDistribution: osDistributionFormatted,
        updateStatusDistribution,
        packageUpdateDistribution
      },
      trends: updateTrends,
      lastUpdated: now.toISOString()
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

// Get hosts with their update status
router.get('/hosts', authenticateToken, requireViewHosts, async (req, res) => {
  try {
    const hosts = await prisma.host.findMany({
      // Show all hosts regardless of status
      select: {
        id: true,
        hostname: true,
        ip: true,
        osType: true,
        osVersion: true,
        lastUpdate: true,
        status: true,
        agentVersion: true,
        autoUpdate: true,
        hostGroup: {
          select: {
            id: true,
            name: true,
            color: true
          }
        },
        _count: {
          select: {
            hostPackages: {
              where: {
                needsUpdate: true
              }
            }
          }
        }
      },
      orderBy: { lastUpdate: 'desc' }
    });

    // Get update counts for each host separately
    const hostsWithUpdateInfo = await Promise.all(
      hosts.map(async (host) => {
        const updatesCount = await prisma.hostPackage.count({
          where: {
            hostId: host.id,
            needsUpdate: true
          }
        });

        // Get the agent update interval setting for stale calculation
        const settings = await prisma.settings.findFirst();
        const updateIntervalMinutes = settings?.updateInterval || 60;
        const thresholdMinutes = updateIntervalMinutes * 2;

        // Calculate effective status based on reporting interval
        const isStale = moment(host.lastUpdate).isBefore(moment().subtract(thresholdMinutes, 'minutes'));
        let effectiveStatus = host.status;
        
        // Override status if host hasn't reported within threshold
        if (isStale && host.status === 'active') {
          effectiveStatus = 'inactive';
        }

        return {
          ...host,
          updatesCount,
          isStale,
          effectiveStatus
        };
      })
    );

    res.json(hostsWithUpdateInfo);
  } catch (error) {
    console.error('Error fetching hosts:', error);
    res.status(500).json({ error: 'Failed to fetch hosts' });
  }
});

// Get packages that need updates across all hosts
router.get('/packages', authenticateToken, requireViewPackages, async (req, res) => {
  try {
    const packages = await prisma.package.findMany({
      where: {
        hostPackages: {
          some: {
            needsUpdate: true
          }
        }
      },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        latestVersion: true,
        hostPackages: {
          where: { needsUpdate: true },
          select: {
            currentVersion: true,
            availableVersion: true,
            isSecurityUpdate: true,
            host: {
              select: {
                id: true,
                hostname: true,
                osType: true
              }
            }
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    const packagesWithHostInfo = packages.map(pkg => ({
      id: pkg.id,
      name: pkg.name,
      description: pkg.description,
      category: pkg.category,
      latestVersion: pkg.latestVersion,
      affectedHostsCount: pkg.hostPackages.length,
      isSecurityUpdate: pkg.hostPackages.some(hp => hp.isSecurityUpdate),
      affectedHosts: pkg.hostPackages.map(hp => ({
        hostId: hp.host.id,
        hostname: hp.host.hostname,
        osType: hp.host.osType,
        currentVersion: hp.currentVersion,
        availableVersion: hp.availableVersion,
        isSecurityUpdate: hp.isSecurityUpdate
      }))
    }));

    res.json(packagesWithHostInfo);
  } catch (error) {
    console.error('Error fetching packages:', error);
    res.status(500).json({ error: 'Failed to fetch packages' });
  }
});

// Get detailed host information
router.get('/hosts/:hostId', authenticateToken, requireViewHosts, async (req, res) => {
  try {
    const { hostId } = req.params;
    
    const host = await prisma.host.findUnique({
      where: { id: hostId },
      include: {
        hostGroup: {
          select: {
            id: true,
            name: true,
            color: true
          }
        },
        hostPackages: {
          include: {
            package: true
          },
          orderBy: {
            needsUpdate: 'desc'
          }
        },
        updateHistory: {
          orderBy: {
            timestamp: 'desc'
          },
          take: 10
        }
      }
    });

    if (!host) {
      return res.status(404).json({ error: 'Host not found' });
    }

    const hostWithStats = {
      ...host,
      stats: {
        totalPackages: host.hostPackages.length,
        outdatedPackages: host.hostPackages.filter(hp => hp.needsUpdate).length,
        securityUpdates: host.hostPackages.filter(hp => hp.needsUpdate && hp.isSecurityUpdate).length
      }
    };

    res.json(hostWithStats);
  } catch (error) {
    console.error('Error fetching host details:', error);
    res.status(500).json({ error: 'Failed to fetch host details' });
  }
});

module.exports = router; 