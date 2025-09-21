const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { requireManageSettings } = require('../middleware/permissions');

const router = express.Router();
const prisma = new PrismaClient();

// Get all role permissions
router.get('/roles', authenticateToken, requireManageSettings, async (req, res) => {
  try {
    const permissions = await prisma.role_permissions.findMany({
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
    
    const permissions = await prisma.role_permissions.findUnique({
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

    const permissions = await prisma.role_permissions.upsert({
      where: { role },
      update: {
        can_view_dashboard: canViewDashboard,
        can_view_hosts: canViewHosts,
        can_manage_hosts: canManageHosts,
        can_view_packages: canViewPackages,
        can_manage_packages: canManagePackages,
        can_view_users: canViewUsers,
        can_manage_users: canManageUsers,
        can_view_reports: canViewReports,
        can_export_data: canExportData,
        can_manage_settings: canManageSettings,
        updated_at: new Date()
      },
      create: {
        id: require('uuid').v4(),
        role,
        can_view_dashboard: canViewDashboard,
        can_view_hosts: canViewHosts,
        can_manage_hosts: canManageHosts,
        can_view_packages: canViewPackages,
        can_manage_packages: canManagePackages,
        can_view_users: canViewUsers,
        can_manage_users: canManageUsers,
        can_view_reports: canViewReports,
        can_export_data: canExportData,
        can_manage_settings: canManageSettings,
        updated_at: new Date()
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
    const usersWithRole = await prisma.users.count({
      where: { role }
    });

    if (usersWithRole > 0) {
      return res.status(400).json({ 
        error: `Cannot delete role "${role}" because ${usersWithRole} user(s) are currently using it` 
      });
    }

    await prisma.role_permissions.delete({
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
    
    const permissions = await prisma.role_permissions.findUnique({
      where: { role: userRole }
    });

    if (!permissions) {
      // If no specific permissions found, return default admin permissions
      return res.json({
        role: userRole,
        can_view_dashboard: true,
        can_view_hosts: true,
        can_manage_hosts: true,
        can_view_packages: true,
        can_manage_packages: true,
        can_view_users: true,
        can_manage_users: true,
        can_view_reports: true,
        can_export_data: true,
        can_manage_settings: true,
      });
    }

    res.json(permissions);
  } catch (error) {
    console.error('Get user permissions error:', error);
    res.status(500).json({ error: 'Failed to fetch user permissions' });
  }
});

module.exports = router;
