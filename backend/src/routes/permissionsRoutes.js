const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { requireManageSettings } = require('../middleware/permissions');

const router = express.Router();
const prisma = new PrismaClient();

// Get all role permissions
router.get('/roles', authenticateToken, requireManageSettings, async (req, res) => {
  try {
    const permissions = await prisma.rolePermissions.findMany({
      orderBy: {
        role: 'asc'
      }
    });

    res.json(permissions);
  } catch (error) {
    console.error('Get role permissions error:', error);
    res.status(500).json({ error: 'Failed to fetch role permissions' });
  }
});

// Get permissions for a specific role
router.get('/roles/:role', authenticateToken, requireManageSettings, async (req, res) => {
  try {
    const { role } = req.params;
    
    const permissions = await prisma.rolePermissions.findUnique({
      where: { role }
    });

    if (!permissions) {
      return res.status(404).json({ error: 'Role not found' });
    }

    res.json(permissions);
  } catch (error) {
    console.error('Get role permission error:', error);
    res.status(500).json({ error: 'Failed to fetch role permission' });
  }
});

// Create or update role permissions
router.put('/roles/:role', authenticateToken, requireManageSettings, async (req, res) => {
  try {
    const { role } = req.params;
    const {
      canViewDashboard,
      canViewHosts,
      canManageHosts,
      canViewPackages,
      canManagePackages,
      canViewUsers,
      canManageUsers,
      canViewReports,
      canExportData,
      canManageSettings
    } = req.body;

    // Prevent modifying admin role permissions (admin should always have full access)
    if (role === 'admin') {
      return res.status(400).json({ error: 'Cannot modify admin role permissions' });
    }

    const permissions = await prisma.rolePermissions.upsert({
      where: { role },
      update: {
        canViewDashboard,
        canViewHosts,
        canManageHosts,
        canViewPackages,
        canManagePackages,
        canViewUsers,
        canManageUsers,
        canViewReports,
        canExportData,
        canManageSettings
      },
      create: {
        role,
        canViewDashboard,
        canViewHosts,
        canManageHosts,
        canViewPackages,
        canManagePackages,
        canViewUsers,
        canManageUsers,
        canViewReports,
        canExportData,
        canManageSettings
      }
    });

    res.json({
      message: 'Role permissions updated successfully',
      permissions
    });
  } catch (error) {
    console.error('Update role permissions error:', error);
    res.status(500).json({ error: 'Failed to update role permissions' });
  }
});

// Delete a role (and its permissions)
router.delete('/roles/:role', authenticateToken, requireManageSettings, async (req, res) => {
  try {
    const { role } = req.params;

    // Prevent deleting admin role
    if (role === 'admin') {
      return res.status(400).json({ error: 'Cannot delete admin role' });
    }

    // Check if any users are using this role
    const usersWithRole = await prisma.user.count({
      where: { role }
    });

    if (usersWithRole > 0) {
      return res.status(400).json({ 
        error: `Cannot delete role "${role}" because ${usersWithRole} user(s) are currently using it` 
      });
    }

    await prisma.rolePermissions.delete({
      where: { role }
    });

    res.json({
      message: `Role "${role}" deleted successfully`
    });
  } catch (error) {
    console.error('Delete role error:', error);
    res.status(500).json({ error: 'Failed to delete role' });
  }
});

// Get user's permissions based on their role
router.get('/user-permissions', authenticateToken, async (req, res) => {
  try {
    const userRole = req.user.role;
    
    const permissions = await prisma.rolePermissions.findUnique({
      where: { role: userRole }
    });

    if (!permissions) {
      // If no specific permissions found, return default admin permissions
      return res.json({
        role: userRole,
        canViewDashboard: true,
        canViewHosts: true,
        canManageHosts: true,
        canViewPackages: true,
        canManagePackages: true,
        canViewUsers: true,
        canManageUsers: true,
        canViewReports: true,
        canExportData: true,
        canManageSettings: true,
      });
    }

    res.json(permissions);
  } catch (error) {
    console.error('Get user permissions error:', error);
    res.status(500).json({ error: 'Failed to fetch user permissions' });
  }
});

module.exports = router;
