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
  Clock,
  WifiOff,
  Settings
} from 'lucide-react'
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js'
import { Pie, Bar } from 'react-chartjs-2'
import { dashboardAPI, dashboardPreferencesAPI, settingsAPI, formatRelativeTime } from '../utils/api'
import DashboardSettingsModal from '../components/DashboardSettingsModal'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title)

const Dashboard = () => {
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [cardPreferences, setCardPreferences] = useState([])
  const navigate = useNavigate()
  const { isDark } = useTheme()
  const { user } = useAuth()

  // Navigation handlers
  const handleTotalHostsClick = () => {
    navigate('/hosts', { replace: true })
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

  const handleOfflineHostsClick = () => {
    navigate('/hosts?filter=offline')
  }

  const handleOSDistributionClick = () => {
    navigate('/hosts?showFilters=true', { replace: true })
  }

  const handleUpdateStatusClick = () => {
    navigate('/hosts?filter=needsUpdates', { replace: true })
  }

  const handlePackagePriorityClick = () => {
    navigate('/packages?filter=security')
  }

  // Chart click handlers
  const handleOSChartClick = (event, elements) => {
    if (elements.length > 0) {
      const elementIndex = elements[0].index
      const osName = stats.charts.osDistribution[elementIndex].name.toLowerCase()
      navigate(`/hosts?osFilter=${osName}&showFilters=true`, { replace: true })
    }
  }

  const handleUpdateStatusChartClick = (event, elements) => {
    if (elements.length > 0) {
      const elementIndex = elements[0].index
      const statusName = stats.charts.updateStatusDistribution[elementIndex].name
      
      // Map status names to filter parameters
      let filter = ''
      if (statusName.toLowerCase().includes('needs updates')) {
        filter = 'needsUpdates'
      } else if (statusName.toLowerCase().includes('up to date')) {
        filter = 'upToDate'
      } else if (statusName.toLowerCase().includes('stale')) {
        filter = 'stale'
      }
      
      if (filter) {
        navigate(`/hosts?filter=${filter}`, { replace: true })
      }
    }
  }

  const handlePackagePriorityChartClick = (event, elements) => {
    if (elements.length > 0) {
      const elementIndex = elements[0].index
      const priorityName = stats.charts.packageUpdateDistribution[elementIndex].name
      
      // Map priority names to filter parameters
      if (priorityName.toLowerCase().includes('security')) {
        navigate('/packages?filter=security', { replace: true })
      } else if (priorityName.toLowerCase().includes('outdated')) {
        navigate('/packages?filter=outdated', { replace: true })
      }
    }
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

  const { data: stats, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: () => dashboardAPI.getStats().then(res => res.data),
    staleTime: 5 * 60 * 1000, // Data stays fresh for 5 minutes
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
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
    } else if (['osDistribution', 'osDistributionBar', 'updateStatus', 'packagePriority'].includes(cardId)) {
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
      
      case 'offlineHosts':
        return (
          <div 
            className={`border rounded-lg p-4 cursor-pointer hover:shadow-card-hover dark:hover:shadow-card-hover-dark transition-shadow duration-200 ${
              stats.cards.offlineHosts > 0 
                ? 'bg-warning-50 border-warning-200' 
                : 'bg-success-50 border-success-200'
            }`}
            onClick={handleOfflineHostsClick}
          >
            <div className="flex">
              <WifiOff className={`h-5 w-5 ${
                stats.cards.offlineHosts > 0 ? 'text-warning-400' : 'text-success-400'
              }`} />
              <div className="ml-3">
                {stats.cards.offlineHosts > 0 ? (
                  <>
                    <h3 className="text-sm font-medium text-warning-800">
                      {stats.cards.offlineHosts} host{stats.cards.offlineHosts > 1 ? 's' : ''} offline/stale
                    </h3>
                    <p className="text-sm text-warning-700 mt-1">
                      These hosts haven't reported in {formatUpdateIntervalThreshold() * 3}+ minutes.
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="text-sm font-medium text-success-800">
                      All hosts are online
                    </h3>
                    <p className="text-sm text-success-700 mt-1">
                      No hosts are offline or stale.
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
      
      case 'osDistributionBar':
        return (
          <div 
            className="card p-6 cursor-pointer hover:shadow-card-hover dark:hover:shadow-card-hover-dark transition-shadow duration-200"
            onClick={handleOSDistributionClick}
          >
            <h3 className="text-lg font-medium text-secondary-900 dark:text-white mb-4">OS Distribution</h3>
            <div className="h-64">
              <Bar data={osBarChartData} options={barChartOptions} />
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
              <Pie data={updateStatusChartData} options={updateStatusChartOptions} />
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
              <Pie data={packagePriorityChartData} options={packagePriorityChartOptions} />
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
    onClick: handleOSChartClick,
  }

  const updateStatusChartOptions = {
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
    onClick: handleUpdateStatusChartClick,
  }

  const packagePriorityChartOptions = {
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
    onClick: handlePackagePriorityChartClick,
  }

  const barChartOptions = {
    responsive: true,
    indexAxis: 'y', // Make the chart horizontal
    plugins: {
      legend: {
        display: false
      },
    },
    scales: {
      x: {
        ticks: {
          color: isDark ? '#ffffff' : '#374151',
          font: {
            size: 12
          }
        },
        grid: {
          color: isDark ? '#374151' : '#e5e7eb'
        }
      },
      y: {
        ticks: {
          color: isDark ? '#ffffff' : '#374151',
          font: {
            size: 12
          }
        },
        grid: {
          color: isDark ? '#374151' : '#e5e7eb'
        }
      }
    }
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

  const osBarChartData = {
    labels: stats.charts.osDistribution.map(item => item.name),
    datasets: [
      {
        label: 'Hosts',
        data: stats.charts.osDistribution.map(item => item.count),
        backgroundColor: [
          '#3B82F6', // Blue
          '#10B981', // Green
          '#F59E0B', // Yellow
          '#EF4444', // Red
          '#8B5CF6', // Purple
          '#06B6D4', // Cyan
        ],
        borderWidth: 1,
        borderColor: isDark ? '#374151' : '#ffffff',
        borderRadius: 4,
        borderSkipped: false,
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
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-secondary-900 dark:text-white">
            Welcome back, {user?.first_name || user?.username || 'User'} 👋
          </h1>
          <p className="text-sm text-secondary-600 dark:text-secondary-400 mt-1">
            Overview of your PatchMon infrastructure
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSettingsModal(true)}
            className="btn-outline flex items-center gap-2"
            title="Customize dashboard layout"
          >
            <Settings className="h-4 w-4" />
            Customize Dashboard
          </button>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn-outline flex items-center gap-2"
            title="Refresh dashboard data"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            {isFetching ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

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