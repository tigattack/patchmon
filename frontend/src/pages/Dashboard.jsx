import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { 
  Server, 
  Package, 
  AlertTriangle, 
  Shield, 
  TrendingUp,
  RefreshCw,
  Clock
} from 'lucide-react'
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js'
import { Pie, Bar } from 'react-chartjs-2'
import { dashboardAPI, dashboardPreferencesAPI, settingsAPI, formatRelativeTime } from '../utils/api'
import DashboardSettingsModal from '../components/DashboardSettingsModal'
import { useTheme } from '../contexts/ThemeContext'

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title)

const Dashboard = () => {
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [cardPreferences, setCardPreferences] = useState([])
  const navigate = useNavigate()
  const { isDark } = useTheme()

  // Navigation handlers
  const handleTotalHostsClick = () => {
    navigate('/hosts')
  }

  const handleHostsNeedingUpdatesClick = () => {
    navigate('/hosts?filter=needsUpdates')
  }

  const handleOutdatedPackagesClick = () => {
    navigate('/packages?filter=outdated')
  }

  const handleSecurityUpdatesClick = () => {
    navigate('/packages?filter=security')
  }

  const handleErroredHostsClick = () => {
    navigate('/hosts?filter=inactive')
  }

  const handleOSDistributionClick = () => {
    navigate('/hosts')
  }

  const handleUpdateStatusClick = () => {
    navigate('/hosts')
  }

  const handlePackagePriorityClick = () => {
    navigate('/packages?filter=security')
  }

  // Helper function to format the update interval threshold
  const formatUpdateIntervalThreshold = () => {
    if (!settings?.updateInterval) return '24 hours'
    
    const intervalMinutes = settings.updateInterval
    const thresholdMinutes = intervalMinutes * 2 // 2x the update interval
    
    if (thresholdMinutes < 60) {
      return `${thresholdMinutes} minutes`
    } else if (thresholdMinutes < 1440) {
      const hours = Math.floor(thresholdMinutes / 60)
      const minutes = thresholdMinutes % 60
      if (minutes === 0) {
        return `${hours} hour${hours > 1 ? 's' : ''}`
      }
      return `${hours}h ${minutes}m`
    } else {
      const days = Math.floor(thresholdMinutes / 1440)
      const hours = Math.floor((thresholdMinutes % 1440) / 60)
      if (hours === 0) {
        return `${days} day${days > 1 ? 's' : ''}`
      }
      return `${days}d ${hours}h`
    }
  }

  const { data: stats, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: () => dashboardAPI.getStats().then(res => res.data),
      refetchInterval: 60000, // Refresh every minute
      staleTime: 30000, // Consider data stale after 30 seconds
  })

  // Fetch settings to get the agent update interval
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsAPI.get().then(res => res.data),
  })

  // Fetch user's dashboard preferences
  const { data: preferences, refetch: refetchPreferences } = useQuery({
    queryKey: ['dashboardPreferences'],
    queryFn: () => dashboardPreferencesAPI.get().then(res => res.data),
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
  })

  // Fetch default card configuration
  const { data: defaultCards } = useQuery({
    queryKey: ['dashboardDefaultCards'],
    queryFn: () => dashboardPreferencesAPI.getDefaults().then(res => res.data),
  })

  // Merge preferences with default cards
  useEffect(() => {
    if (preferences && defaultCards) {
      const mergedCards = defaultCards.map(defaultCard => {
        const userPreference = preferences.find(p => p.cardId === defaultCard.cardId);
        return {
          ...defaultCard,
          enabled: userPreference ? userPreference.enabled : defaultCard.enabled,
          order: userPreference ? userPreference.order : defaultCard.order
        };
      }).sort((a, b) => a.order - b.order);
      
      setCardPreferences(mergedCards);
    } else if (defaultCards) {
      // If no preferences exist, use defaults
      setCardPreferences(defaultCards.sort((a, b) => a.order - b.order));
    }
  }, [preferences, defaultCards])

  // Listen for custom event from Layout component
  useEffect(() => {
    const handleOpenSettings = () => {
      setShowSettingsModal(true);
    };

    window.addEventListener('openDashboardSettings', handleOpenSettings);
    return () => {
      window.removeEventListener('openDashboardSettings', handleOpenSettings);
    };
  }, [])

  // Helper function to check if a card should be displayed
  const isCardEnabled = (cardId) => {
    const card = cardPreferences.find(c => c.cardId === cardId);
    return card ? card.enabled : true; // Default to enabled if not found
  }

  // Helper function to get card type for layout grouping
  const getCardType = (cardId) => {
    if (['totalHosts', 'hostsNeedingUpdates', 'totalOutdatedPackages', 'securityUpdates'].includes(cardId)) {
      return 'stats';
    } else if (['osDistribution', 'updateStatus', 'packagePriority'].includes(cardId)) {
      return 'charts';
    } else if (['erroredHosts', 'quickStats'].includes(cardId)) {
      return 'fullwidth';
    }
    return 'fullwidth'; // Default to full width
  }

  // Helper function to get CSS class for card group
  const getGroupClassName = (cardType) => {
    switch (cardType) {
      case 'stats':
        return 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4';
      case 'charts':
        return 'grid grid-cols-1 lg:grid-cols-3 gap-6';
      case 'fullwidth':
        return 'space-y-6';
      default:
        return 'space-y-6';
    }
  }

  // Helper function to render a card by ID
  const renderCard = (cardId) => {
    switch (cardId) {
      case 'totalHosts':
        return (
          <div 
            className="card p-4 cursor-pointer hover:shadow-card-hover dark:hover:shadow-card-hover-dark transition-shadow duration-200"
            onClick={handleTotalHostsClick}
          >
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Server className="h-5 w-5 text-primary-600 mr-2" />
              </div>
              <div className="w-0 flex-1">
                <p className="text-sm text-secondary-500 dark:text-white">Total Hosts</p>
                <p className="text-xl font-semibold text-secondary-900 dark:text-white">
                  {stats.cards.totalHosts}
                </p>
              </div>
            </div>
          </div>
        );
      
      case 'hostsNeedingUpdates':
        return (
          <div 
            className="card p-4 cursor-pointer hover:shadow-card-hover dark:hover:shadow-card-hover-dark transition-shadow duration-200"
            onClick={handleHostsNeedingUpdatesClick}
          >
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-5 w-5 text-warning-600 mr-2" />
              </div>
              <div className="w-0 flex-1">
                <p className="text-sm text-secondary-500 dark:text-white">Needs Updating</p>
                <p className="text-xl font-semibold text-secondary-900 dark:text-white">
                  {stats.cards.hostsNeedingUpdates}
                </p>
              </div>
            </div>
          </div>
        );
      
      case 'totalOutdatedPackages':
        return (
          <div 
            className="card p-4 cursor-pointer hover:shadow-card-hover dark:hover:shadow-card-hover-dark transition-shadow duration-200"
            onClick={handleOutdatedPackagesClick}
          >
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Package className="h-5 w-5 text-secondary-600 mr-2" />
              </div>
              <div className="w-0 flex-1">
                <p className="text-sm text-secondary-500 dark:text-white">Outdated Packages</p>
                <p className="text-xl font-semibold text-secondary-900 dark:text-white">
                  {stats.cards.totalOutdatedPackages}
                </p>
              </div>
            </div>
          </div>
        );
      
      case 'securityUpdates':
        return (
          <div 
            className="card p-4 cursor-pointer hover:shadow-card-hover dark:hover:shadow-card-hover-dark transition-shadow duration-200"
            onClick={handleSecurityUpdatesClick}
          >
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Shield className="h-5 w-5 text-danger-600 mr-2" />
              </div>
              <div className="w-0 flex-1">
                <p className="text-sm text-secondary-500 dark:text-white">Security Updates</p>
                <p className="text-xl font-semibold text-secondary-900 dark:text-white">
                  {stats.cards.securityUpdates}
                </p>
              </div>
            </div>
          </div>
        );
      
      case 'erroredHosts':
        return (
          <div 
            className={`border rounded-lg p-4 cursor-pointer hover:shadow-card-hover dark:hover:shadow-card-hover-dark transition-shadow duration-200 ${
              stats.cards.erroredHosts > 0 
                ? 'bg-danger-50 border-danger-200' 
                : 'bg-success-50 border-success-200'
            }`}
            onClick={handleErroredHostsClick}
          >
            <div className="flex">
              <AlertTriangle className={`h-5 w-5 ${
                stats.cards.erroredHosts > 0 ? 'text-danger-400' : 'text-success-400'
              }`} />
              <div className="ml-3">
                {stats.cards.erroredHosts > 0 ? (
                  <>
                    <h3 className="text-sm font-medium text-danger-800">
                      {stats.cards.erroredHosts} host{stats.cards.erroredHosts > 1 ? 's' : ''} haven't reported in {formatUpdateIntervalThreshold()}+
                    </h3>
                    <p className="text-sm text-danger-700 mt-1">
                      These hosts may be offline or experiencing connectivity issues.
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="text-sm font-medium text-success-800">
                      All hosts are reporting normally
                    </h3>
                    <p className="text-sm text-success-700 mt-1">
                      No hosts have failed to report in the last {formatUpdateIntervalThreshold()}.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      
      case 'osDistribution':
        return (
          <div 
            className="card p-6 cursor-pointer hover:shadow-card-hover dark:hover:shadow-card-hover-dark transition-shadow duration-200"
            onClick={handleOSDistributionClick}
          >
            <h3 className="text-lg font-medium text-secondary-900 dark:text-white mb-4">OS Distribution</h3>
            <div className="h-64">
              <Pie data={osChartData} options={chartOptions} />
            </div>
          </div>
        );
      
      case 'updateStatus':
        return (
          <div 
            className="card p-6 cursor-pointer hover:shadow-card-hover dark:hover:shadow-card-hover-dark transition-shadow duration-200"
            onClick={handleUpdateStatusClick}
          >
            <h3 className="text-lg font-medium text-secondary-900 dark:text-white mb-4">Update Status</h3>
            <div className="h-64">
              <Pie data={updateStatusChartData} options={chartOptions} />
            </div>
          </div>
        );
      
      case 'packagePriority':
        return (
          <div 
            className="card p-6 cursor-pointer hover:shadow-card-hover dark:hover:shadow-card-hover-dark transition-shadow duration-200"
            onClick={handlePackagePriorityClick}
          >
            <h3 className="text-lg font-medium text-secondary-900 dark:text-white mb-4">Package Priority</h3>
            <div className="h-64">
              <Pie data={packagePriorityChartData} options={chartOptions} />
            </div>
          </div>
        );
      
      case 'quickStats':
        return (
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-secondary-900 dark:text-white">Quick Stats</h3>
              <TrendingUp className="h-5 w-5 text-success-500" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary-600">
                  {((stats.cards.hostsNeedingUpdates / stats.cards.totalHosts) * 100).toFixed(1)}%
                </div>
                <div className="text-sm text-secondary-500 dark:text-secondary-300">Hosts need updates</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-danger-600">
                  {stats.cards.securityUpdates}
                </div>
                <div className="text-sm text-secondary-500 dark:text-secondary-300">Security updates pending</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-success-600">
                  {stats.cards.totalHosts - stats.cards.erroredHosts}
                </div>
                <div className="text-sm text-secondary-500 dark:text-secondary-300">Hosts online</div>
              </div>
            </div>
          </div>
        );
      
      default:
        return null;
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-danger-50 border border-danger-200 rounded-md p-4">
        <div className="flex">
          <AlertTriangle className="h-5 w-5 text-danger-400" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-danger-800">Error loading dashboard</h3>
            <p className="text-sm text-danger-700 mt-1">
              {error.message || 'Failed to load dashboard statistics'}
            </p>
            <button
              onClick={() => refetch()}
              className="mt-2 btn-danger text-xs"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: isDark ? '#ffffff' : '#374151',
          font: {
            size: 12
          }
        }
      },
    },
  }

  const osChartData = {
    labels: stats.charts.osDistribution.map(item => item.name),
    datasets: [
      {
        data: stats.charts.osDistribution.map(item => item.count),
        backgroundColor: [
          '#3B82F6', // Blue
          '#10B981', // Green
          '#F59E0B', // Yellow
          '#EF4444', // Red
          '#8B5CF6', // Purple
          '#06B6D4', // Cyan
        ],
        borderWidth: 2,
        borderColor: '#ffffff',
      },
    ],
  }

  const updateStatusChartData = {
    labels: stats.charts.updateStatusDistribution.map(item => item.name),
    datasets: [
      {
        data: stats.charts.updateStatusDistribution.map(item => item.count),
        backgroundColor: [
          '#10B981', // Green - Up to date
          '#F59E0B', // Yellow - Needs updates
          '#EF4444', // Red - Errored
        ],
        borderWidth: 2,
        borderColor: '#ffffff',
      },
    ],
  }

  const packagePriorityChartData = {
    labels: stats.charts.packageUpdateDistribution.map(item => item.name),
    datasets: [
      {
        data: stats.charts.packageUpdateDistribution.map(item => item.count),
        backgroundColor: [
          '#EF4444', // Red - Security
          '#3B82F6', // Blue - Regular
        ],
        borderWidth: 2,
        borderColor: '#ffffff',
      },
    ],
  }

  return (
    <div className="space-y-6">

      {/* Dynamically Rendered Cards - Unified Order */}
      {(() => {
        const enabledCards = cardPreferences
          .filter(card => isCardEnabled(card.cardId))
          .sort((a, b) => a.order - b.order);
        
        // Group consecutive cards of the same type for proper layout
        const cardGroups = [];
        let currentGroup = null;
        
        enabledCards.forEach(card => {
          const cardType = getCardType(card.cardId);
          
          if (!currentGroup || currentGroup.type !== cardType) {
            // Start a new group
            currentGroup = {
              type: cardType,
              cards: [card]
            };
            cardGroups.push(currentGroup);
          } else {
            // Add to existing group
            currentGroup.cards.push(card);
          }
        });
        
        return (
          <>
            {cardGroups.map((group, groupIndex) => (
              <div key={groupIndex} className={getGroupClassName(group.type)}>
                {group.cards.map(card => (
                  <div key={card.cardId}>
                    {renderCard(card.cardId)}
            </div>
                ))}
          </div>
            ))}
          </>
        );
      })()}

      {/* Dashboard Settings Modal */}
      <DashboardSettingsModal 
        isOpen={showSettingsModal} 
        onClose={() => setShowSettingsModal(false)} 
      />
    </div>
  )
}

export default Dashboard 