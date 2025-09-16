import React, { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { 
  Package, 
  Server, 
  Shield, 
  RefreshCw, 
  Search, 
  AlertTriangle, 
  Filter,
  ExternalLink
} from 'lucide-react'
import { dashboardAPI } from '../utils/api'

const Packages = () => {
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [securityFilter, setSecurityFilter] = useState('all')
  const [searchParams] = useSearchParams()

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

  const { data: packages, isLoading, error, refetch } = useQuery({
    queryKey: ['packages'],
    queryFn: () => dashboardAPI.getPackages().then(res => res.data),
    refetchInterval: 60000,
    staleTime: 30000,
  })

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

  // Filter packages based on search and filters
  const filteredPackages = packages?.filter(pkg => {
    const matchesSearch = pkg.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (pkg.description && pkg.description.toLowerCase().includes(searchTerm.toLowerCase()))
    
    const matchesCategory = categoryFilter === 'all' || pkg.category === categoryFilter
    
    const matchesSecurity = securityFilter === 'all' || 
                           (securityFilter === 'security' && pkg.isSecurityUpdate) ||
                           (securityFilter === 'regular' && !pkg.isSecurityUpdate)
    
    return matchesSearch && matchesCategory && matchesSecurity
  }) || []

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

  return (
    <div className="space-y-6">

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center">
            <Package className="h-5 w-5 text-primary-600 mr-2" />
            <div>
              <p className="text-sm text-secondary-500 dark:text-white">Total Packages</p>
              <p className="text-xl font-semibold text-secondary-900 dark:text-white">{packages?.length || 0}</p>
            </div>
          </div>
        </div>
        
        <div className="card p-4">
          <div className="flex items-center">
            <Shield className="h-5 w-5 text-danger-600 mr-2" />
            <div>
              <p className="text-sm text-secondary-500 dark:text-white">Security Updates</p>
              <p className="text-xl font-semibold text-secondary-900 dark:text-white">
                {packages?.filter(pkg => pkg.isSecurityUpdate).length || 0}
              </p>
            </div>
          </div>
        </div>
        
        <div className="card p-4">
          <div className="flex items-center">
            <Server className="h-5 w-5 text-warning-600 mr-2" />
            <div>
              <p className="text-sm text-secondary-500 dark:text-white">Affected Hosts</p>
              <p className="text-xl font-semibold text-secondary-900 dark:text-white">
                {uniqueAffectedHostsCount}
              </p>
            </div>
          </div>
        </div>
        
        <div className="card p-4">
          <div className="flex items-center">
            <Filter className="h-5 w-5 text-secondary-600 mr-2" />
            <div>
              <p className="text-sm text-secondary-500 dark:text-white">Categories</p>
              <p className="text-xl font-semibold text-secondary-900 dark:text-white">{categories.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
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
        </div>
      </div>

      {/* Packages List */}
      <div className="card">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium text-secondary-900 dark:text-white mb-4">
            Packages Needing Updates ({filteredPackages.length})
          </h3>
          
          {filteredPackages.length === 0 ? (
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
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-secondary-200 dark:divide-secondary-600">
                <thead className="bg-secondary-50 dark:bg-secondary-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 dark:text-secondary-300 uppercase tracking-wider">
                      Package
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 dark:text-secondary-300 uppercase tracking-wider">
                      Latest Version
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 dark:text-secondary-300 uppercase tracking-wider">
                      Affected Hosts
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 dark:text-secondary-300 uppercase tracking-wider">
                      Priority
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-secondary-800 divide-y divide-secondary-200 dark:divide-secondary-600">
                  {filteredPackages.map((pkg) => (
                    <tr key={pkg.id} className="hover:bg-secondary-50 dark:hover:bg-secondary-700">
                      <td className="px-6 py-4 whitespace-nowrap">
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
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-secondary-900 dark:text-white">
                        {pkg.latestVersion || 'Unknown'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-secondary-900 dark:text-white">
                          {pkg.affectedHostsCount} host{pkg.affectedHostsCount !== 1 ? 's' : ''}
                        </div>
                        <div className="text-xs text-secondary-500 dark:text-secondary-300">
                          {pkg.affectedHosts.slice(0, 2).map(host => host.hostname).join(', ')}
                          {pkg.affectedHosts.length > 2 && ` +${pkg.affectedHosts.length - 2} more`}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {pkg.isSecurityUpdate ? (
                          <span className="badge-danger flex items-center gap-1">
                            <Shield className="h-3 w-3" />
                            Security Update
                          </span>
                        ) : (
                          <span className="badge-warning">Regular Update</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Packages 