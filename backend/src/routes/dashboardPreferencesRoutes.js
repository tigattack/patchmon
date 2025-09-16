const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Get user's dashboard preferences
router.get('/', authenticateToken, async (req, res) => {
  try {
    const preferences = await prisma.dashboardPreferences.findMany({
      where: { userId: req.user.id },
      orderBy: { order: 'asc' }
    });
    
    res.json(preferences);
  } catch (error) {
    console.error('Dashboard preferences fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard preferences' });
  }
});

// Update dashboard preferences (bulk update)
router.put('/', authenticateToken, [
  body('preferences').isArray().withMessage('Preferences must be an array'),
  body('preferences.*.cardId').isString().withMessage('Card ID is required'),
  body('preferences.*.enabled').isBoolean().withMessage('Enabled must be boolean'),
  body('preferences.*.order').isInt().withMessage('Order must be integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { preferences } = req.body;
    const userId = req.user.id;

    // Delete existing preferences for this user
    await prisma.dashboardPreferences.deleteMany({
      where: { userId }
    });

    // Create new preferences
    const newPreferences = preferences.map(pref => ({
      userId,
      cardId: pref.cardId,
      enabled: pref.enabled,
      order: pref.order
    }));

    const createdPreferences = await prisma.dashboardPreferences.createMany({
      data: newPreferences
    });

    res.json({
      message: 'Dashboard preferences updated successfully',
      preferences: newPreferences
    });
  } catch (error) {
    console.error('Dashboard preferences update error:', error);
    res.status(500).json({ error: 'Failed to update dashboard preferences' });
  }
});

// Get default dashboard card configuration
router.get('/defaults', authenticateToken, async (req, res) => {
  try {
    const defaultCards = [
      { cardId: 'totalHosts', title: 'Total Hosts', icon: 'Server', enabled: true, order: 0 },
      { cardId: 'hostsNeedingUpdates', title: 'Needs Updating', icon: 'AlertTriangle', enabled: true, order: 1 },
      { cardId: 'totalOutdatedPackages', title: 'Outdated Packages', icon: 'Package', enabled: true, order: 2 },
      { cardId: 'securityUpdates', title: 'Security Updates', icon: 'Shield', enabled: true, order: 3 },
      { cardId: 'erroredHosts', title: 'Errored Hosts', icon: 'AlertTriangle', enabled: true, order: 4 },
      { cardId: 'osDistribution', title: 'OS Distribution', icon: 'BarChart3', enabled: true, order: 5 },
      { cardId: 'updateStatus', title: 'Update Status', icon: 'BarChart3', enabled: true, order: 6 },
      { cardId: 'packagePriority', title: 'Package Priority', icon: 'BarChart3', enabled: true, order: 7 },
      { cardId: 'quickStats', title: 'Quick Stats', icon: 'TrendingUp', enabled: true, order: 8 }
    ];

    res.json(defaultCards);
  } catch (error) {
    console.error('Default dashboard cards error:', error);
    res.status(500).json({ error: 'Failed to fetch default dashboard cards' });
  }
});

module.exports = router;
