const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { body, validationResult } = require('express-validator');

const router = express.Router();
const prisma = new PrismaClient();

// Get all packages with their update status
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      search = '', 
      category = '', 
      needsUpdate = '', 
      isSecurityUpdate = '' 
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Build where clause
    const where = {
      AND: [
        // Search filter
        search ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } }
          ]
        } : {},
        // Category filter
        category ? { category: { equals: category } } : {},
        // Update status filters
        needsUpdate ? {
          host_packages: {
            some: {
              needs_update: needsUpdate === 'true'
            }
          }
        } : {},
        isSecurityUpdate ? {
          host_packages: {
            some: {
              is_security_update: isSecurityUpdate === 'true'
            }
          }
        } : {}
      ]
    };

    // Get packages with counts
    const [packages, totalCount] = await Promise.all([
      prisma.packages.findMany({
        where,
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          latest_version: true,
          created_at: true,
          _count: {
            host_packages: true
          }
        },
        skip,
        take,
        orderBy: {
          name: 'asc'
        }
      }),
      prisma.packages.count({ where })
    ]);

    // Get additional stats for each package
    const packagesWithStats = await Promise.all(
      packages.map(async (pkg) => {
        const [updatesCount, securityCount, affectedHosts] = await Promise.all([
          prisma.host_packages.count({
            where: {
              package_id: pkg.id,
              needs_update: true
            }
          }),
          prisma.host_packages.count({
            where: {
              package_id: pkg.id,
              needs_update: true,
              is_security_update: true
            }
          }),
          prisma.host_packages.findMany({
            where: {
              package_id: pkg.id,
              needs_update: true
            },
            select: {
              hosts: {
                select: {
                  id: true,
                  friendly_name: true,
                  hostname: true,
                  os_type: true
                }
              }
            },
            take: 10 // Limit to first 10 for performance
          })
        ]);

        return {
          ...pkg,
          stats: {
            totalInstalls: pkg._count.hostPackages,
            updatesNeeded: updatesCount,
            securityUpdates: securityCount,
            affectedHosts: affectedHosts.map(hp => hp.host)
          }
        };
      })
    );

    res.json({
      packages: packagesWithStats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching packages:', error);
    res.status(500).json({ error: 'Failed to fetch packages' });
  }
});

// Get package details by ID
router.get('/:packageId', async (req, res) => {
  try {
    const { packageId } = req.params;

    const packageData = await prisma.packages.findUnique({
      where: { id: packageId },
      include: {
          host_packages: {
          include: {
            host: {
              select: {
                id: true,
                hostname: true,
                ip: true,
                osType: true,
                osVersion: true,
                lastUpdate: true
              }
            }
          },
          orderBy: {
            needsUpdate: 'desc'
          }
        }
      }
    });

    if (!packageData) {
      return res.status(404).json({ error: 'Package not found' });
    }

    // Calculate statistics
    const stats = {
      totalInstalls: packageData.host_packages.length,
      updatesNeeded: packageData.host_packages.filter(hp => hp.needsUpdate).length,
      securityUpdates: packageData.host_packages.filter(hp => hp.needsUpdate && hp.isSecurityUpdate).length,
      upToDate: packageData.host_packages.filter(hp => !hp.needsUpdate).length
    };

    // Group by version
    const versionDistribution = packageData.host_packages.reduce((acc, hp) => {
      const version = hp.currentVersion;
      acc[version] = (acc[version] || 0) + 1;
      return acc;
    }, {});

    // Group by OS type
    const osDistribution = packageData.host_packages.reduce((acc, hp) => {
      const osType = hp.host.osType;
      acc[osType] = (acc[osType] || 0) + 1;
      return acc;
    }, {});

    res.json({
      ...packageData,
      stats,
      distributions: {
        versions: Object.entries(versionDistribution).map(([version, count]) => ({
          version,
          count
        })),
        osTypes: Object.entries(osDistribution).map(([osType, count]) => ({
          osType,
          count
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching package details:', error);
    res.status(500).json({ error: 'Failed to fetch package details' });
  }
});

module.exports = router; 