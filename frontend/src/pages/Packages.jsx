import React, { useState, useEffect, useMemo } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { 
  Package, 
  Server, 
  Shield, 
  RefreshCw, 
  Search, 
  AlertTriangle, 
  Filter,
  ExternalLink,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  Settings,
  Columns,
  GripVertical,
  X,
  Eye as EyeIcon,
  EyeOff as EyeOffIcon
} from 'lucide-react'
import { dashboardAPI } from '../utils/api'

const Packages = () => {
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [securityFilter, setSecurityFilter] = useState('all')
  const [hostFilter, setHostFilter] = useState('all')
  const [sortField, setSortField] = useState('name')
  const [sortDirection, setSortDirection] = useState('asc')
  const [showColumnSettings, setShowColumnSettings] = useState(false)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  // Handle host filter from URL parameter
  useEffect(() => {
    const hostParam = searchParams.get('host')
    if (hostParam) {
      setHostFilter(hostParam)
    }
  }, [searchParams])

  // Column configuration
  const [columnConfig, setColumnConfig] = useState(() => {
    const defaultConfig = [
      { id: 'name', label: 'Package', visible: true, order: 0 },
      { id: 'affectedHosts', label: 'Affected Hosts', visible: true, order: 1 },
      { id: 'priority', label: 'Priority', visible: true, order: 2 },
      { id: 'latestVersion', label: 'Latest Version', visible: true, order: 3 }
    ]

    const saved = localStorage.getItem('packages-column-config')
    if (saved) {
      const savedConfig = JSON.parse(saved)
      // Merge with defaults to handle new columns
      return defaultConfig.map(defaultCol => {
        const savedCol = savedConfig.find(col => col.id === defaultCol.id)
        return savedCol ? { ...defaultCol, ...savedCol } : defaultCol
      })
    }
    return defaultConfig
  })

  // Update column configuration
  const updateColumnConfig = (newConfig) => {
    setColumnConfig(newConfig)
    localStorage.setItem('packages-column-config', JSON.stringify(newConfig))
  }

  // Handle affected hosts click
  const handleAffectedHostsClick = (pkg) => {
    const hostIds = pkg.affectedHosts.map(host => host.hostId)
    const hostNames = pkg.affectedHosts.map(host => host.friendlyName)
    
    // Create URL with selected hosts and filter
    const params = new URLSearchParams()
    params.set('selected', hostIds.join(','))
    params.set('filter', 'selected')
    
    // Navigate to hosts page with selected hosts
    navigate(`/hosts?${params.toString()}`)
  }

  // Handle URL filter parameters
  useEffect(() => {
    const filter = searchParams.get('filter')
    if (filter === 'outdated') {
      // For outdated packages, we want to show all packages that need updates
      // This is the default behavior, so we don't need to change filters
      setCategoryFilter('all')
      setSecurityFilter('all')
    } else if (filter === 'security') {
      // For security updates, filter to show only security updates
      setSecurityFilter('security')
      setCategoryFilter('all')
    }
  }, [searchParams])

  const { data: packages, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['packages'],
    queryFn: () => dashboardAPI.getPackages().then(res => res.data),
    staleTime: 5 * 60 * 1000, // Data stays fresh for 5 minutes
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
  })

  // Fetch hosts data to get total packages count
  const { data: hosts } = useQuery({
    queryKey: ['hosts'],
    queryFn: () => dashboardAPI.getHosts().then(res => res.data),
    staleTime: 5 * 60 * 1000, // Data stays fresh for 5 minutes
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
  })

  // Filter and sort packages
  const filteredAndSortedPackages = useMemo(() => {
    if (!packages) return []
    
    // Filter packages
    const filtered = packages.filter(pkg => {
      const matchesSearch = pkg.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (pkg.description && pkg.description.toLowerCase().includes(searchTerm.toLowerCase()))
      
      const matchesCategory = categoryFilter === 'all' || pkg.category === categoryFilter
      
      const matchesSecurity = securityFilter === 'all' || 
                             (securityFilter === 'security' && pkg.isSecurityUpdate) ||
                             (securityFilter === 'regular' && !pkg.isSecurityUpdate)
      
      const matchesHost = hostFilter === 'all' || 
                         pkg.affectedHosts.some(host => host.hostId === hostFilter)
      
      return matchesSearch && matchesCategory && matchesSecurity && matchesHost
    })

    // Sorting
    filtered.sort((a, b) => {
      let aValue, bValue
      
      switch (sortField) {
        case 'name':
          aValue = a.name?.toLowerCase() || ''
          bValue = b.name?.toLowerCase() || ''
          break
        case 'latestVersion':
          aValue = a.latestVersion?.toLowerCase() || ''
          bValue = b.latestVersion?.toLowerCase() || ''
          break
        case 'affectedHosts':
          aValue = a.affectedHostsCount || 0
          bValue = b.affectedHostsCount || 0
          break
        case 'priority':
          aValue = a.isSecurityUpdate ? 0 : 1 // Security updates first
          bValue = b.isSecurityUpdate ? 0 : 1
          break
        default:
          aValue = a.name?.toLowerCase() || ''
          bValue = b.name?.toLowerCase() || ''
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return filtered
  }, [packages, searchTerm, categoryFilter, securityFilter, sortField, sortDirection])

  // Get visible columns in order
  const visibleColumns = columnConfig
    .filter(col => col.visible)
    .sort((a, b) => a.order - b.order)

  // Sorting functions
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const getSortIcon = (field) => {
    if (sortField !== field) return <ArrowUpDown className="h-4 w-4" />
    return sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
  }

  // Column management functions
  const toggleColumnVisibility = (columnId) => {
    const newConfig = columnConfig.map(col => 
      col.id === columnId ? { ...col, visible: !col.visible } : col
    )
    updateColumnConfig(newConfig)
  }

  const reorderColumns = (fromIndex, toIndex) => {
    const newConfig = [...columnConfig]
    const [movedColumn] = newConfig.splice(fromIndex, 1)
    newConfig.splice(toIndex, 0, movedColumn)
    
    // Update order values
    const updatedConfig = newConfig.map((col, index) => ({ ...col, order: index }))
    updateColumnConfig(updatedConfig)
  }

  const resetColumns = () => {
    const defaultConfig = [
      { id: 'name', label: 'Package', visible: true, order: 0 },
      { id: 'affectedHosts', label: 'Affected Hosts', visible: true, order: 1 },
      { id: 'priority', label: 'Priority', visible: true, order: 2 },
      { id: 'latestVersion', label: 'Latest Version', visible: true, order: 3 }
    ]
    updateColumnConfig(defaultConfig)
  }

  // Helper function to render table cell content
  const renderCellContent = (column, pkg) => {
    switch (column.id) {
      case 'name':
        return (
          <div className="flex items-center">
            <Package className="h-5 w-5 text-secondary-400 mr-3" />
            <div>
              <div className="text-sm font-medium text-secondary-900 dark:text-white">
                {pkg.name}
              </div>
              {pkg.description && (
                <div className="text-sm text-secondary-500 dark:text-secondary-300 max-w-md truncate">
                  {pkg.description}
                </div>
              )}
              {pkg.category && (
                <div className="text-xs text-secondary-400 dark:text-secondary-400">
                  Category: {pkg.category}
                </div>
              )}
            </div>
          </div>
        )
      case 'affectedHosts':
        return (
          <button
            onClick={() => handleAffectedHostsClick(pkg)}
            className="text-left hover:bg-secondary-100 dark:hover:bg-secondary-700 rounded p-1 -m-1 transition-colors group"
            title={`Click to view all ${pkg.affectedHostsCount} affected hosts`}
          >
            <div className="text-sm text-secondary-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400">
              {pkg.affectedHostsCount} host{pkg.affectedHostsCount !== 1 ? 's' : ''}
            </div>
          </button>
        )
      case 'priority':
        return pkg.isSecurityUpdate ? (
          <span className="badge-danger flex items-center gap-1">
            <Shield className="h-3 w-3" />
            Security Update
          </span>
        ) : (
          <span className="badge-warning">Regular Update</span>
        )
      case 'latestVersion':
        return (
          <div className="text-sm text-secondary-900 dark:text-white max-w-xs truncate" title={pkg.latestVersion || 'Unknown'}>
            {pkg.latestVersion || 'Unknown'}
          </div>
        )
      default:
        return null
    }
  }

  // Get unique categories
  const categories = [...new Set(packages?.map(pkg => pkg.category).filter(Boolean))] || []

  // Calculate unique affected hosts
  const uniqueAffectedHosts = new Set()
  packages?.forEach(pkg => {
    pkg.affectedHosts.forEach(host => {
      uniqueAffectedHosts.add(host.hostId)
    })
  })
  const uniqueAffectedHostsCount = uniqueAffectedHosts.size

  // Calculate total packages across all hosts (including up-to-date ones)
  const totalPackagesCount = hosts?.reduce((total, host) => {
    return total + (host.totalPackagesCount || 0)
  }, 0) || 0

  // Calculate outdated packages (packages that need updates)
  const outdatedPackagesCount = packages?.length || 0

  // Calculate security updates
  const securityUpdatesCount = packages?.filter(pkg => pkg.isSecurityUpdate).length || 0

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        
        <div className="bg-danger-50 border border-danger-200 rounded-md p-4">
          <div className="flex">
            <AlertTriangle className="h-5 w-5 text-danger-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-danger-800">Error loading packages</h3>
              <p className="text-sm text-danger-700 mt-1">
                {error.message || 'Failed to load packages'}
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
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-7rem)] flex flex-col overflow-hidden">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-secondary-900 dark:text-white">Packages</h1>
          <p className="text-sm text-secondary-600 dark:text-secondary-400 mt-1">
            Manage package updates and security patches
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn-outline flex items-center gap-2"
            title="Refresh packages data"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            {isFetching ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6 flex-shrink-0">
        <div className="card p-4 cursor-pointer hover:shadow-card-hover dark:hover:shadow-card-hover-dark transition-shadow duration-200">
          <div className="flex items-center">
            <Package className="h-5 w-5 text-primary-600 mr-2" />
            <div>
              <p className="text-sm text-secondary-500 dark:text-white">Total Packages</p>
              <p className="text-xl font-semibold text-secondary-900 dark:text-white">{totalPackagesCount}</p>
            </div>
          </div>
        </div>
        
        <div className="card p-4 cursor-pointer hover:shadow-card-hover dark:hover:shadow-card-hover-dark transition-shadow duration-200">
          <div className="flex items-center">
            <Package className="h-5 w-5 text-warning-600 mr-2" />
            <div>
              <p className="text-sm text-secondary-500 dark:text-white">Total Outdated Packages</p>
              <p className="text-xl font-semibold text-secondary-900 dark:text-white">
                {outdatedPackagesCount}
              </p>
            </div>
          </div>
        </div>
        
        <div className="card p-4 cursor-pointer hover:shadow-card-hover dark:hover:shadow-card-hover-dark transition-shadow duration-200">
          <div className="flex items-center">
            <Server className="h-5 w-5 text-warning-600 mr-2" />
            <div>
              <p className="text-sm text-secondary-500 dark:text-white">Hosts Pending Updates</p>
              <p className="text-xl font-semibold text-secondary-900 dark:text-white">
                {uniqueAffectedHostsCount}
              </p>
            </div>
          </div>
        </div>
        
        <div className="card p-4 cursor-pointer hover:shadow-card-hover dark:hover:shadow-card-hover-dark transition-shadow duration-200">
          <div className="flex items-center">
            <Shield className="h-5 w-5 text-danger-600 mr-2" />
            <div>
              <p className="text-sm text-secondary-500 dark:text-white">Security Updates Across All Hosts</p>
              <p className="text-xl font-semibold text-secondary-900 dark:text-white">{securityUpdatesCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Packages List */}
      <div className="card flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="px-4 py-4 sm:p-4 flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="flex items-center justify-end mb-4">
            {/* Empty selection controls area to match hosts page spacing */}
          </div>
          
          {/* Table Controls */}
          <div className="mb-4 space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Search */}
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-secondary-400 dark:text-secondary-500" />
                  <input
                    type="text"
                    placeholder="Search packages..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-secondary-300 dark:border-secondary-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-secondary-800 text-secondary-900 dark:text-white placeholder-secondary-500 dark:placeholder-secondary-400"
                  />
                </div>
              </div>
              
              {/* Category Filter */}
              <div className="sm:w-48">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-secondary-300 dark:border-secondary-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-secondary-800 text-secondary-900 dark:text-white"
                >
                  <option value="all">All Categories</option>
                  {categories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
              
              {/* Security Filter */}
              <div className="sm:w-48">
                <select
                  value={securityFilter}
                  onChange={(e) => setSecurityFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-secondary-300 dark:border-secondary-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-secondary-800 text-secondary-900 dark:text-white"
                >
                  <option value="all">All Updates</option>
                  <option value="security">Security Only</option>
                  <option value="regular">Regular Only</option>
                </select>
              </div>
              
              {/* Host Filter */}
              <div className="sm:w-48">
                <select
                  value={hostFilter}
                  onChange={(e) => setHostFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-secondary-300 dark:border-secondary-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-secondary-800 text-secondary-900 dark:text-white"
                >
                  <option value="all">All Hosts</option>
                  {hosts?.map(host => (
                    <option key={host.id} value={host.id}>{host.friendlyName}</option>
                  ))}
                </select>
              </div>
              
              {/* Columns Button */}
              <div className="flex items-center">
                <button
                  onClick={() => setShowColumnSettings(true)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-secondary-700 dark:text-secondary-300 bg-white dark:bg-secondary-700 border border-secondary-300 dark:border-secondary-600 rounded-md hover:bg-secondary-50 dark:hover:bg-secondary-600 transition-colors"
                >
                  <Columns className="h-4 w-4" />
                  Columns
                </button>
              </div>
            </div>
          </div>
          
          <div className="flex-1 overflow-hidden">
            {filteredAndSortedPackages.length === 0 ? (
              <div className="text-center py-8">
                <Package className="h-12 w-12 text-secondary-400 mx-auto mb-4" />
                <p className="text-secondary-500 dark:text-secondary-300">
                  {packages?.length === 0 ? 'No packages need updates' : 'No packages match your filters'}
                </p>
                {packages?.length === 0 && (
                  <p className="text-sm text-secondary-400 dark:text-secondary-400 mt-2">
                    All packages are up to date across all hosts
                  </p>
                )}
              </div>
            ) : (
              <div className="h-full overflow-auto">
                <table className="min-w-full divide-y divide-secondary-200 dark:divide-secondary-600">
                <thead className="bg-secondary-50 dark:bg-secondary-700 sticky top-0 z-10">
                  <tr>
                    {visibleColumns.map((column) => (
                      <th key={column.id} className="px-4 py-2 text-center text-xs font-medium text-secondary-500 dark:text-secondary-300 uppercase tracking-wider">
                        <button
                          onClick={() => handleSort(column.id)}
                          className="flex items-center gap-1 hover:text-secondary-700 dark:hover:text-secondary-200 transition-colors"
                        >
                          {column.label}
                          {getSortIcon(column.id)}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-secondary-800 divide-y divide-secondary-200 dark:divide-secondary-600">
                  {filteredAndSortedPackages.map((pkg) => (
                    <tr key={pkg.id} className="hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors">
                      {visibleColumns.map((column) => (
                        <td key={column.id} className="px-4 py-2 whitespace-nowrap text-center">
                          {renderCellContent(column, pkg)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Column Settings Modal */}
      {showColumnSettings && (
        <ColumnSettingsModal
          columnConfig={columnConfig}
          onClose={() => setShowColumnSettings(false)}
          onToggleVisibility={toggleColumnVisibility}
          onReorder={reorderColumns}
          onReset={resetColumns}
        />
      )}
    </div>
  )
}

// Column Settings Modal Component
const ColumnSettingsModal = ({ columnConfig, onClose, onToggleVisibility, onReorder, onReset }) => {
  const [draggedIndex, setDraggedIndex] = useState(null)

  const handleDragStart = (e, index) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e, dropIndex) => {
    e.preventDefault()
    if (draggedIndex !== null && draggedIndex !== dropIndex) {
      onReorder(draggedIndex, dropIndex)
    }
    setDraggedIndex(null)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-secondary-800 rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-secondary-900 dark:text-white">Customize Columns</h3>
          <button onClick={onClose} className="text-secondary-400 hover:text-secondary-600 dark:text-secondary-500 dark:hover:text-secondary-300">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="space-y-2">
          {columnConfig.map((column, index) => (
            <div
              key={column.id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, index)}
              className={`flex items-center justify-between p-3 border rounded-lg cursor-move ${
                draggedIndex === index ? 'opacity-50' : 'hover:bg-secondary-50 dark:hover:bg-secondary-700'
              } border-secondary-200 dark:border-secondary-600`}
            >
              <div className="flex items-center gap-3">
                <GripVertical className="h-4 w-4 text-secondary-400 dark:text-secondary-500" />
                <span className="text-sm font-medium text-secondary-900 dark:text-white">
                  {column.label}
                </span>
              </div>
              <button
                onClick={() => onToggleVisibility(column.id)}
                className={`p-1 rounded ${
                  column.visible
                    ? 'text-primary-600 hover:text-primary-700'
                    : 'text-secondary-400 hover:text-secondary-600'
                }`}
              >
                {column.visible ? <EyeIcon className="h-4 w-4" /> : <EyeOffIcon className="h-4 w-4" />}
              </button>
            </div>
          ))}
        </div>
        
        <div className="flex justify-between mt-6">
          <button
            onClick={onReset}
            className="px-4 py-2 text-sm font-medium text-secondary-700 dark:text-secondary-200 bg-white dark:bg-secondary-700 border border-secondary-300 dark:border-secondary-600 rounded-md hover:bg-secondary-50 dark:hover:bg-secondary-600"
          >
            Reset to Default
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

export default Packages 