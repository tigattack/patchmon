const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Permission middleware factory
const requirePermission = (permission) => {
  return async (req, res, next) => {
    try {
      // Get user's role permissions
      const rolePermissions = await prisma.role_permissions.findUnique({
        where: { role: req.user.role }
      });

      // If no specific permissions found, default to admin permissions (for backward compatibility)
      if (!rolePermissions) {
        console.warn(`No permissions found for role: ${req.user.role}, defaulting to admin access`);
        return next();
      }

      // Check if user has the required permission
      if (!rolePermissions[permission]) {
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          message: `You don't have permission to ${permission.replace('can', '').toLowerCase()}`
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({ error: 'Permission check failed' });
    }
  };
};

// Specific permission middlewares
const requireViewDashboard = requirePermission('canViewDashboard');
const requireViewHosts = requirePermission('canViewHosts');
const requireManageHosts = requirePermission('canManageHosts');
const requireViewPackages = requirePermission('canViewPackages');
const requireManagePackages = requirePermission('canManagePackages');
const requireViewUsers = requirePermission('canViewUsers');
const requireManageUsers = requirePermission('canManageUsers');
const requireViewReports = requirePermission('canViewReports');
const requireExportData = requirePermission('canExportData');
const requireManageSettings = requirePermission('canManageSettings');

module.exports = {
  requirePermission,
  requireViewDashboard,
  requireViewHosts,
  requireManageHosts,
  requireViewPackages,
  requireManagePackages,
  requireViewUsers,
  requireManageUsers,
  requireViewReports,
  requireExportData,
  requireManageSettings
};
