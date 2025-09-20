import React, { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  Server, 
  ArrowLeft, 
  Package, 
  Shield, 
  Clock, 
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Calendar,
  Monitor,
  HardDrive,
  Key,
  Trash2,
  X,
  Copy,
  Eye,
  Code,
  EyeOff,
  ToggleLeft,
  ToggleRight,
  Edit,
  Check,
  ChevronDown,
  ChevronUp,
  Cpu,
  MemoryStick,
  Globe,
  Wifi,
  Terminal,
  Activity
} from 'lucide-react'
import { dashboardAPI, adminHostsAPI, settingsAPI, formatRelativeTime, formatDate } from '../utils/api'
import { OSIcon } from '../utils/osIcons.jsx'
import InlineEdit from '../components/InlineEdit'

const HostDetail = () => {
  const { hostId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showCredentialsModal, setShowCredentialsModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isEditingFriendlyName, setIsEditingFriendlyName] = useState(false)
  const [editedFriendlyName, setEditedFriendlyName] = useState('')
  const [showAllUpdates, setShowAllUpdates] = useState(false)
  
  const { data: host, isLoading, error, refetch } = useQuery({
    queryKey: ['host', hostId],
    queryFn: () => dashboardAPI.getHostDetail(hostId).then(res => res.data),
    refetchInterval: 60000,
    staleTime: 30000,
  })

  // Auto-show credentials modal for new/pending hosts
  React.useEffect(() => {
    if (host && host.status === 'pending') {
      setShowCredentialsModal(true)
    }
  }, [host])

  const deleteHostMutation = useMutation({
    mutationFn: (hostId) => adminHostsAPI.delete(hostId),
    onSuccess: () => {
      queryClient.invalidateQueries(['hosts'])
      navigate('/hosts')
    },
  })

  // Toggle auto-update mutation
  const toggleAutoUpdateMutation = useMutation({
    mutationFn: (autoUpdate) => adminHostsAPI.toggleAutoUpdate(hostId, autoUpdate).then(res => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries(['host', hostId])
      queryClient.invalidateQueries(['hosts'])
    }
  })

  const updateFriendlyNameMutation = useMutation({
    mutationFn: (friendlyName) => adminHostsAPI.updateFriendlyName(hostId, friendlyName).then(res => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries(['host', hostId])
      queryClient.invalidateQueries(['hosts'])
    }
  })

  const handleDeleteHost = async () => {
    if (window.confirm(`Are you sure you want to delete host "${host.friendlyName}"? This action cannot be undone.`)) {
      try {
        await deleteHostMutation.mutateAsync(hostId)
      } catch (error) {
        console.error('Failed to delete host:', error)
        alert('Failed to delete host')
      }
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/hosts" className="text-secondary-500 hover:text-secondary-700">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </div>
        </div>
        
        <div className="bg-danger-50 border border-danger-200 rounded-md p-4">
          <div className="flex">
            <AlertTriangle className="h-5 w-5 text-danger-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-danger-800">Error loading host</h3>
              <p className="text-sm text-danger-700 mt-1">
                {error.message || 'Failed to load host details'}
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

  if (!host) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/hosts" className="text-secondary-500 hover:text-secondary-700">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </div>
        </div>
        
        <div className="card p-8 text-center">
          <Server className="h-12 w-12 text-secondary-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-secondary-900 dark:text-white mb-2">Host Not Found</h3>
          <p className="text-secondary-600 dark:text-secondary-300">
            The requested host could not be found.
          </p>
        </div>
      </div>
    )
  }

  const getStatusColor = (isStale, needsUpdate) => {
    if (isStale) return 'text-danger-600'
    if (needsUpdate) return 'text-warning-600'
    return 'text-success-600'
  }

  const getStatusIcon = (isStale, needsUpdate) => {
    if (isStale) return <AlertTriangle className="h-5 w-5" />
    if (needsUpdate) return <Clock className="h-5 w-5" />
    return <CheckCircle className="h-5 w-5" />
  }

  const getStatusText = (isStale, needsUpdate) => {
    if (isStale) return 'Stale'
    if (needsUpdate) return 'Needs Updates'
    return 'Up to Date'
  }

  const isStale = new Date() - new Date(host.lastUpdate) > 24 * 60 * 60 * 1000

  return (
    <div className="space-y-6">
      {/* Host Information */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Basic Info */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-secondary-900 dark:text-white">Host Information</h3>
            <div className="flex items-center gap-2">
              <Link to="/hosts" className="text-secondary-500 hover:text-secondary-700 dark:text-secondary-400 dark:hover:text-secondary-200">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Server className="h-5 w-5 text-secondary-400" />
              <div className="flex-1">
                <p className="text-sm text-secondary-500 dark:text-secondary-300 mb-1">Friendly Name</p>
                <InlineEdit
                  value={host.friendlyName}
                  onSave={(newName) => updateFriendlyNameMutation.mutate(newName)}
                  placeholder="Enter friendly name..."
                  maxLength={100}
                  validate={(value) => {
                    if (!value.trim()) return 'Friendly name is required';
                    if (value.trim().length < 1) return 'Friendly name must be at least 1 character';
                    if (value.trim().length > 100) return 'Friendly name must be less than 100 characters';
                    return null;
                  }}
                  className="w-full"
                />
              </div>
            </div>
            
            {host.hostname && (
              <div className="flex items-center gap-3">
                <Server className="h-5 w-5 text-secondary-400" />
                <div>
                  <p className="text-sm text-secondary-500 dark:text-secondary-300">System Hostname</p>
                  <p className="font-medium text-secondary-900 dark:text-white font-mono text-sm">{host.hostname}</p>
                </div>
              </div>
            )}
            
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-secondary-400" />
              <div>
                <p className="text-sm text-secondary-500 dark:text-secondary-300">Host Group</p>
                {host.hostGroup ? (
                  <span 
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white"
                    style={{ backgroundColor: host.hostGroup.color }}
                  >
                    {host.hostGroup.name}
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary-100 dark:bg-secondary-700 text-secondary-800 dark:text-secondary-200">
                    Ungrouped
                  </span>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Monitor className="h-5 w-5 text-secondary-400" />
              <div>
                <p className="text-sm text-secondary-500 dark:text-secondary-300">Operating System</p>
                <div className="flex items-center gap-2">
                  <OSIcon osType={host.osType} className="h-5 w-5" />
                  <p className="font-medium text-secondary-900 dark:text-white">{host.osType} {host.osVersion}</p>
                </div>
              </div>
            </div>
            
            {host.ip && (
              <div className="flex items-center gap-3">
                <HardDrive className="h-5 w-5 text-secondary-400" />
                <div>
                  <p className="text-sm text-secondary-500 dark:text-secondary-300">IP Address</p>
                  <p className="font-medium text-secondary-900 dark:text-white">{host.ip}</p>
                </div>
              </div>
            )}
            
            {host.architecture && (
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-secondary-400" />
                <div>
                  <p className="text-sm text-secondary-500 dark:text-secondary-300">Architecture</p>
                  <p className="font-medium text-secondary-900 dark:text-white">{host.architecture}</p>
                </div>
              </div>
            )}
            
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-secondary-400" />
              <div>
                <p className="text-sm text-secondary-500 dark:text-secondary-300">Last Update</p>
                <p className="font-medium text-secondary-900 dark:text-white">{formatRelativeTime(host.lastUpdate)}</p>
              </div>
            </div>
            
            {host.agentVersion && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Code className="h-5 w-5 text-secondary-400" />
                  <div>
                    <p className="text-sm text-secondary-500 dark:text-secondary-300">Agent Version</p>
                    <p className="font-medium text-secondary-900 dark:text-white">{host.agentVersion}</p>
                  </div>
                </div>
                
                {/* Auto-Update Toggle */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-secondary-500 dark:text-secondary-300">Auto-update</span>
                  <button
                    onClick={() => toggleAutoUpdateMutation.mutate(!host.autoUpdate)}
                    disabled={toggleAutoUpdateMutation.isPending}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                      host.autoUpdate 
                        ? 'bg-primary-600 dark:bg-primary-500' 
                        : 'bg-secondary-200 dark:bg-secondary-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        host.autoUpdate ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            )}
          </div>
          
          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-4 mt-4 border-t border-secondary-200 dark:border-secondary-600">
            <button
              onClick={() => setShowCredentialsModal(true)}
              className="btn-outline flex items-center gap-2"
            >
              <Key className="h-4 w-4" />
              Deploy Agent
            </button>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="btn-danger flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete Host
            </button>
          </div>
        </div>

        {/* Statistics */}
        <div className="card p-6">
          <h3 className="text-lg font-medium text-secondary-900 dark:text-white mb-4">Statistics</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="flex items-center justify-center w-12 h-12 bg-primary-100 rounded-lg mx-auto mb-2">
                <Package className="h-6 w-6 text-primary-600" />
              </div>
              <p className="text-2xl font-bold text-secondary-900 dark:text-white">{host.stats.totalPackages}</p>
              <p className="text-sm text-secondary-500 dark:text-secondary-300">Total Packages</p>
            </div>
            
            <button 
              onClick={() => navigate(`/packages?host=${hostId}`)}
              className="text-center w-full p-2 rounded-lg hover:bg-warning-50 dark:hover:bg-warning-900/20 transition-colors group"
              title="View outdated packages for this host"
            >
              <div className="flex items-center justify-center w-12 h-12 bg-warning-100 rounded-lg mx-auto mb-2 group-hover:bg-warning-200 dark:group-hover:bg-warning-800 transition-colors">
                <Clock className="h-6 w-6 text-warning-600" />
              </div>
              <p className="text-2xl font-bold text-secondary-900 dark:text-white">{host.stats.outdatedPackages}</p>
              <p className="text-sm text-secondary-500 dark:text-secondary-300">Outdated</p>
            </button>
            
            <div className="text-center">
              <div className="flex items-center justify-center w-12 h-12 bg-danger-100 rounded-lg mx-auto mb-2">
                <Shield className="h-6 w-6 text-danger-600" />
              </div>
              <p className="text-2xl font-bold text-secondary-900 dark:text-white">{host.stats.securityUpdates}</p>
              <p className="text-sm text-secondary-500 dark:text-secondary-300">Security Updates</p>
            </div>
          </div>
          
          {/* Status */}
          <div className="mt-6 pt-4 border-t border-secondary-200 dark:border-secondary-600">
            <div className={`flex items-center gap-2 ${getStatusColor(isStale, host.stats.outdatedPackages > 0)}`}>
              {getStatusIcon(isStale, host.stats.outdatedPackages > 0)}
              <span className="font-medium">{getStatusText(isStale, host.stats.outdatedPackages > 0)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Hardware Information */}
      {(host.cpuModel || host.ramInstalled || host.diskDetails) && (
        <div className="card p-6">
          <h3 className="text-lg font-medium text-secondary-900 dark:text-white mb-4">Hardware Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {host.cpuModel && (
              <div className="flex items-center gap-3">
                <Cpu className="h-5 w-5 text-secondary-400" />
                <div>
                  <p className="text-sm text-secondary-500 dark:text-secondary-300">CPU Model</p>
                  <p className="font-medium text-secondary-900 dark:text-white text-sm">{host.cpuModel}</p>
                </div>
              </div>
            )}
            
            {host.cpuCores && (
              <div className="flex items-center gap-3">
                <Cpu className="h-5 w-5 text-secondary-400" />
                <div>
                  <p className="text-sm text-secondary-500 dark:text-secondary-300">CPU Cores</p>
                  <p className="font-medium text-secondary-900 dark:text-white">{host.cpuCores}</p>
                </div>
              </div>
            )}
            
            {host.ramInstalled && (
              <div className="flex items-center gap-3">
                <MemoryStick className="h-5 w-5 text-secondary-400" />
                <div>
                  <p className="text-sm text-secondary-500 dark:text-secondary-300">RAM Installed</p>
                  <p className="font-medium text-secondary-900 dark:text-white">{host.ramInstalled} GB</p>
                </div>
              </div>
            )}
            
            {host.swapSize !== undefined && (
              <div className="flex items-center gap-3">
                <HardDrive className="h-5 w-5 text-secondary-400" />
                <div>
                  <p className="text-sm text-secondary-500 dark:text-secondary-300">Swap Size</p>
                  <p className="font-medium text-secondary-900 dark:text-white">{host.swapSize} GB</p>
                </div>
              </div>
            )}
          </div>
          
          {host.diskDetails && Array.isArray(host.diskDetails) && host.diskDetails.length > 0 && (
            <div className="mt-4 pt-4 border-t border-secondary-200 dark:border-secondary-600">
              <h4 className="text-sm font-medium text-secondary-900 dark:text-white mb-3">Disk Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {host.diskDetails.map((disk, index) => (
                  <div key={index} className="bg-secondary-50 dark:bg-secondary-700 p-3 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <HardDrive className="h-4 w-4 text-secondary-500" />
                      <span className="font-medium text-secondary-900 dark:text-white text-sm">{disk.name}</span>
                    </div>
                    <p className="text-xs text-secondary-600 dark:text-secondary-300">Size: {disk.size}</p>
                    {disk.mountpoint && (
                      <p className="text-xs text-secondary-600 dark:text-secondary-300">Mount: {disk.mountpoint}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Network Information */}
      {(host.gatewayIp || host.dnsServers || host.networkInterfaces) && (
        <div className="card p-6">
          <h3 className="text-lg font-medium text-secondary-900 dark:text-white mb-4">Network Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {host.gatewayIp && (
              <div className="flex items-center gap-3">
                <Globe className="h-5 w-5 text-secondary-400" />
                <div>
                  <p className="text-sm text-secondary-500 dark:text-secondary-300">Gateway IP</p>
                  <p className="font-medium text-secondary-900 dark:text-white font-mono text-sm">{host.gatewayIp}</p>
                </div>
              </div>
            )}
            
            {host.dnsServers && Array.isArray(host.dnsServers) && host.dnsServers.length > 0 && (
              <div className="flex items-center gap-3">
                <Globe className="h-5 w-5 text-secondary-400" />
                <div>
                  <p className="text-sm text-secondary-500 dark:text-secondary-300">DNS Servers</p>
                  <div className="space-y-1">
                    {host.dnsServers.map((dns, index) => (
                      <p key={index} className="font-medium text-secondary-900 dark:text-white font-mono text-sm">{dns}</p>
                    ))}
                  </div>
                </div>
              </div>
            )}
            
            {host.networkInterfaces && Array.isArray(host.networkInterfaces) && host.networkInterfaces.length > 0 && (
              <div className="flex items-center gap-3">
                <Wifi className="h-5 w-5 text-secondary-400" />
                <div>
                  <p className="text-sm text-secondary-500 dark:text-secondary-300">Network Interfaces</p>
                  <div className="space-y-1">
                    {host.networkInterfaces.map((iface, index) => (
                      <p key={index} className="font-medium text-secondary-900 dark:text-white text-sm">{iface.name}</p>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* System Information */}
      {(host.kernelVersion || host.selinuxStatus || host.systemUptime || host.loadAverage) && (
        <div className="card p-6">
          <h3 className="text-lg font-medium text-secondary-900 dark:text-white mb-4">System Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {host.kernelVersion && (
              <div className="flex items-center gap-3">
                <Terminal className="h-5 w-5 text-secondary-400" />
                <div>
                  <p className="text-sm text-secondary-500 dark:text-secondary-300">Kernel Version</p>
                  <p className="font-medium text-secondary-900 dark:text-white font-mono text-sm">{host.kernelVersion}</p>
                </div>
              </div>
            )}
            
            {host.selinuxStatus && (
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-secondary-400" />
                <div>
                  <p className="text-sm text-secondary-500 dark:text-secondary-300">SELinux Status</p>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    host.selinuxStatus === 'enabled' 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      : host.selinuxStatus === 'permissive'
                      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                  }`}>
                    {host.selinuxStatus}
                  </span>
                </div>
              </div>
            )}
            
            {host.systemUptime && (
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-secondary-400" />
                <div>
                  <p className="text-sm text-secondary-500 dark:text-secondary-300">System Uptime</p>
                  <p className="font-medium text-secondary-900 dark:text-white text-sm">{host.systemUptime}</p>
                </div>
              </div>
            )}
            
            {host.loadAverage && Array.isArray(host.loadAverage) && host.loadAverage.length > 0 && (
              <div className="flex items-center gap-3">
                <Activity className="h-5 w-5 text-secondary-400" />
                <div>
                  <p className="text-sm text-secondary-500 dark:text-secondary-300">Load Average</p>
                  <p className="font-medium text-secondary-900 dark:text-white text-sm">
                    {host.loadAverage.map((load, index) => (
                      <span key={index}>
                        {load.toFixed(2)}
                        {index < host.loadAverage.length - 1 && ', '}
                      </span>
                    ))}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Update History */}
      <div className="w-1/2">
        <div className="card max-h-96">
        <div className="px-4 py-3 border-b border-secondary-200 dark:border-secondary-600">
          <h3 className="text-base font-medium text-secondary-900 dark:text-white">Agent Update History</h3>
        </div>
        
        <div className="overflow-x-auto max-h-80">
          {host.updateHistory?.length > 0 ? (
            <>
              <table className="min-w-full divide-y divide-secondary-200 dark:divide-secondary-600">
                <thead className="bg-secondary-50 dark:bg-secondary-700 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-secondary-500 dark:text-secondary-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-secondary-500 dark:text-secondary-300 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-secondary-500 dark:text-secondary-300 uppercase tracking-wider">
                      Packages
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-secondary-500 dark:text-secondary-300 uppercase tracking-wider">
                      Security
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-secondary-800 divide-y divide-secondary-200 dark:divide-secondary-600">
                  {(showAllUpdates ? host.updateHistory : host.updateHistory.slice(0, 3)).map((update, index) => (
                    <tr key={update.id} className="hover:bg-secondary-50 dark:hover:bg-secondary-700">
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${update.status === 'success' ? 'bg-success-500' : 'bg-danger-500'}`} />
                          <span className={`text-xs font-medium ${
                            update.status === 'success' 
                              ? 'text-success-700 dark:text-success-300' 
                              : 'text-danger-700 dark:text-danger-300'
                          }`}>
                            {update.status === 'success' ? 'Success' : 'Failed'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs text-secondary-900 dark:text-white">
                        {formatDate(update.timestamp)}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs text-secondary-900 dark:text-white">
                        {update.packagesCount}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {update.securityCount > 0 ? (
                          <div className="flex items-center gap-1">
                            <Shield className="h-3 w-3 text-danger-600" />
                            <span className="text-xs text-danger-600 font-medium">
                              {update.securityCount}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-secondary-500 dark:text-secondary-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {host.updateHistory.length > 3 && (
                <div className="px-4 py-2 border-t border-secondary-200 dark:border-secondary-600 bg-secondary-50 dark:bg-secondary-700">
                  <button
                    onClick={() => setShowAllUpdates(!showAllUpdates)}
                    className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
                  >
                    {showAllUpdates ? (
                      <>
                        <ChevronUp className="h-3 w-3" />
                        Show Less
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3" />
                        Show All ({host.updateHistory.length} total)
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-6">
              <Calendar className="h-8 w-8 text-secondary-400 mx-auto mb-2" />
              <p className="text-sm text-secondary-500 dark:text-secondary-300">No update history available</p>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Credentials Modal */}
      {showCredentialsModal && (
        <CredentialsModal
          host={host}
          isOpen={showCredentialsModal}
          onClose={() => setShowCredentialsModal(false)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <DeleteConfirmationModal
          host={host}
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={handleDeleteHost}
          isLoading={deleteHostMutation.isPending}
        />
      )}
    </div>
  )
}

// Credentials Modal Component
const CredentialsModal = ({ host, isOpen, onClose }) => {
  const [showApiKey, setShowApiKey] = useState(false)
  const [activeTab, setActiveTab] = useState('quick-install')

  const { data: serverUrlData } = useQuery({
    queryKey: ['serverUrl'],
    queryFn: () => settingsAPI.getServerUrl().then(res => res.data),
  })
  
  const serverUrl = serverUrlData?.serverUrl || 'http://localhost:3001'

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
  }

  const getSetupCommands = () => {
    return `# Run this on the target host: ${host?.friendlyName}

echo "🔄 Setting up PatchMon agent..."

# Download and install agent
echo "📥 Downloading agent script..."
curl -o /tmp/patchmon-agent.sh ${serverUrl}/api/v1/hosts/agent/download
sudo mkdir -p /etc/patchmon
sudo mv /tmp/patchmon-agent.sh /usr/local/bin/patchmon-agent.sh
sudo chmod +x /usr/local/bin/patchmon-agent.sh

# Configure credentials
echo "🔑 Configuring API credentials..."
sudo /usr/local/bin/patchmon-agent.sh configure "${host?.apiId}" "${host?.apiKey}"

# Test configuration
echo "🧪 Testing configuration..."
sudo /usr/local/bin/patchmon-agent.sh test

# Send initial update
echo "📊 Sending initial package data..."
sudo /usr/local/bin/patchmon-agent.sh update

# Setup crontab
echo "⏰ Setting up hourly crontab..."
echo "0 * * * * /usr/local/bin/patchmon-agent.sh update >/dev/null 2>&1" | sudo crontab -

echo "✅ PatchMon agent setup complete!"
echo "   - Agent installed: /usr/local/bin/patchmon-agent.sh"
echo "   - Config directory: /etc/patchmon/"
echo "   - Updates: Every hour via crontab"
echo "   - View logs: tail -f /var/log/patchmon-agent.log"`
  }

  if (!isOpen || !host) return null

  const commands = getSetupCommands()

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-secondary-800 rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-secondary-900 dark:text-white">Host Setup - {host.friendlyName}</h3>
          <button onClick={onClose} className="text-secondary-400 hover:text-secondary-600 dark:text-secondary-500 dark:hover:text-secondary-300">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-secondary-200 dark:border-secondary-600 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('quick-install')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'quick-install'
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-secondary-500 dark:text-secondary-400 hover:text-secondary-700 dark:hover:text-secondary-300 hover:border-secondary-300 dark:hover:border-secondary-500'
              }`}
            >
              Quick Install
            </button>
            <button
              onClick={() => setActiveTab('credentials')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'credentials'
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-secondary-500 dark:text-secondary-400 hover:text-secondary-700 dark:hover:text-secondary-300 hover:border-secondary-300 dark:hover:border-secondary-500'
              }`}
            >
              API Credentials
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'quick-install' && (
          <div className="space-y-4">
            <div className="bg-primary-50 dark:bg-primary-900 border border-primary-200 dark:border-primary-700 rounded-lg p-4">
              <h4 className="text-sm font-medium text-primary-900 dark:text-primary-200 mb-2">One-Line Installation</h4>
              <p className="text-sm text-primary-700 dark:text-primary-300 mb-3">
                Copy and run this command on the target host to automatically install and configure the PatchMon agent:
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={`curl -s ${serverUrl}/api/v1/hosts/install | bash -s -- ${serverUrl} "${host.apiId}" "${host.apiKey}"`}
                  readOnly
                  className="flex-1 px-3 py-2 border border-primary-300 dark:border-primary-600 rounded-md bg-white dark:bg-secondary-800 text-sm font-mono text-secondary-900 dark:text-white"
                />
                <button
                  onClick={() => copyToClipboard(`curl -s ${serverUrl}/api/v1/hosts/install | bash -s -- ${serverUrl} "${host.apiId}" "${host.apiKey}"`)}
                  className="btn-primary flex items-center gap-1"
                >
                  <Copy className="h-4 w-4" />
                  Copy
                </button>
              </div>
            </div>

            <div className="bg-secondary-50 dark:bg-secondary-700 rounded-lg p-4">
              <h4 className="text-sm font-medium text-secondary-900 dark:text-white mb-2">Manual Installation</h4>
              <p className="text-sm text-secondary-600 dark:text-secondary-300 mb-3">
                If you prefer to install manually, follow these steps:
              </p>
              <div className="space-y-3">
                <div className="bg-white dark:bg-secondary-800 rounded-md p-3 border border-secondary-200 dark:border-secondary-600">
                  <h5 className="text-sm font-medium text-secondary-900 dark:text-white mb-2">1. Download Agent Script</h5>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={`curl -o /tmp/patchmon-agent.sh ${serverUrl}/api/v1/hosts/agent/download`}
                      readOnly
                      className="flex-1 px-3 py-2 border border-secondary-300 dark:border-secondary-600 rounded-md bg-white dark:bg-secondary-800 text-sm font-mono text-secondary-900 dark:text-white"
                    />
                    <button
                      onClick={() => copyToClipboard(`curl -o /tmp/patchmon-agent.sh ${serverUrl}/api/v1/hosts/agent/download`)}
                      className="btn-secondary flex items-center gap-1"
                    >
                      <Copy className="h-4 w-4" />
                      Copy
                    </button>
                  </div>
                </div>

                <div className="bg-white dark:bg-secondary-800 rounded-md p-3 border border-secondary-200 dark:border-secondary-600">
                  <h5 className="text-sm font-medium text-secondary-900 dark:text-white mb-2">2. Install Agent</h5>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value="sudo mkdir -p /etc/patchmon && sudo mv /tmp/patchmon-agent.sh /usr/local/bin/patchmon-agent.sh && sudo chmod +x /usr/local/bin/patchmon-agent.sh"
                      readOnly
                      className="flex-1 px-3 py-2 border border-secondary-300 dark:border-secondary-600 rounded-md bg-white dark:bg-secondary-800 text-sm font-mono text-secondary-900 dark:text-white"
                    />
                    <button
                      onClick={() => copyToClipboard("sudo mkdir -p /etc/patchmon && sudo mv /tmp/patchmon-agent.sh /usr/local/bin/patchmon-agent.sh && sudo chmod +x /usr/local/bin/patchmon-agent.sh")}
                      className="btn-secondary flex items-center gap-1"
                    >
                      <Copy className="h-4 w-4" />
                      Copy
                    </button>
                  </div>
                </div>

                <div className="bg-white dark:bg-secondary-800 rounded-md p-3 border border-secondary-200 dark:border-secondary-600">
                  <h5 className="text-sm font-medium text-secondary-900 dark:text-white mb-2">3. Configure Credentials</h5>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={`sudo /usr/local/bin/patchmon-agent.sh configure "${host.apiId}" "${host.apiKey}"`}
                      readOnly
                      className="flex-1 px-3 py-2 border border-secondary-300 dark:border-secondary-600 rounded-md bg-white dark:bg-secondary-800 text-sm font-mono text-secondary-900 dark:text-white"
                    />
                    <button
                      onClick={() => copyToClipboard(`sudo /usr/local/bin/patchmon-agent.sh configure "${host.apiId}" "${host.apiKey}"`)}
                      className="btn-secondary flex items-center gap-1"
                    >
                      <Copy className="h-4 w-4" />
                      Copy
                    </button>
                  </div>
                </div>

                <div className="bg-white dark:bg-secondary-800 rounded-md p-3 border border-secondary-200 dark:border-secondary-600">
                  <h5 className="text-sm font-medium text-secondary-900 dark:text-white mb-2">4. Test Configuration</h5>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value="sudo /usr/local/bin/patchmon-agent.sh test"
                      readOnly
                      className="flex-1 px-3 py-2 border border-secondary-300 dark:border-secondary-600 rounded-md bg-white dark:bg-secondary-800 text-sm font-mono text-secondary-900 dark:text-white"
                    />
                    <button
                      onClick={() => copyToClipboard("sudo /usr/local/bin/patchmon-agent.sh test")}
                      className="btn-secondary flex items-center gap-1"
                    >
                      <Copy className="h-4 w-4" />
                      Copy
                    </button>
                  </div>
                </div>

                <div className="bg-white dark:bg-secondary-800 rounded-md p-3 border border-secondary-200 dark:border-secondary-600">
                  <h5 className="text-sm font-medium text-secondary-900 dark:text-white mb-2">5. Send Initial Data</h5>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value="sudo /usr/local/bin/patchmon-agent.sh update"
                      readOnly
                      className="flex-1 px-3 py-2 border border-secondary-300 dark:border-secondary-600 rounded-md bg-white dark:bg-secondary-800 text-sm font-mono text-secondary-900 dark:text-white"
                    />
                    <button
                      onClick={() => copyToClipboard("sudo /usr/local/bin/patchmon-agent.sh update")}
                      className="btn-secondary flex items-center gap-1"
                    >
                      <Copy className="h-4 w-4" />
                      Copy
                    </button>
                  </div>
                </div>

                <div className="bg-white dark:bg-secondary-800 rounded-md p-3 border border-secondary-200 dark:border-secondary-600">
                  <h5 className="text-sm font-medium text-secondary-900 dark:text-white mb-2">6. Setup Crontab (Optional)</h5>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value='echo "0 * * * * /usr/local/bin/patchmon-agent.sh update >/dev/null 2>&1" | sudo crontab -'
                      readOnly
                      className="flex-1 px-3 py-2 border border-secondary-300 dark:border-secondary-600 rounded-md bg-white dark:bg-secondary-800 text-sm font-mono text-secondary-900 dark:text-white"
                    />
                    <button
                      onClick={() => copyToClipboard('echo "0 * * * * /usr/local/bin/patchmon-agent.sh update >/dev/null 2>&1" | sudo crontab -')}
                      className="btn-secondary flex items-center gap-1"
                    >
                      <Copy className="h-4 w-4" />
                      Copy
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'credentials' && (
          <div className="space-y-6">
            <div className="bg-secondary-50 dark:bg-secondary-700 rounded-lg p-4">
              <h4 className="text-sm font-medium text-secondary-900 dark:text-white mb-3">API Credentials</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-200 mb-1">API ID</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={host.apiId}
                      readOnly
                      className="flex-1 px-3 py-2 border border-secondary-300 dark:border-secondary-600 rounded-md bg-secondary-50 dark:bg-secondary-800 text-sm font-mono text-secondary-900 dark:text-white"
                    />
                    <button
                      onClick={() => copyToClipboard(host.apiId)}
                      className="btn-outline flex items-center gap-1"
                    >
                      <Copy className="h-4 w-4" />
                      Copy
                    </button>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-200 mb-1">API Key</label>
                  <div className="flex items-center gap-2">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={host.apiKey}
                      readOnly
                      className="flex-1 px-3 py-2 border border-secondary-300 dark:border-secondary-600 rounded-md bg-secondary-50 dark:bg-secondary-800 text-sm font-mono text-secondary-900 dark:text-white"
                    />
                    <button
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="btn-outline flex items-center gap-1"
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => copyToClipboard(host.apiKey)}
                      className="btn-outline flex items-center gap-1"
                    >
                      <Copy className="h-4 w-4" />
                      Copy
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-warning-50 dark:bg-warning-900 border border-warning-200 dark:border-warning-700 rounded-lg p-4">
              <div className="flex">
                <AlertTriangle className="h-5 w-5 text-warning-400 dark:text-warning-300" />
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-warning-800 dark:text-warning-200">Security Notice</h3>
                  <p className="text-sm text-warning-700 dark:text-warning-300 mt-1">
                    Keep these credentials secure. They provide full access to this host's monitoring data.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}


        <div className="flex justify-end pt-6">
          <button onClick={onClose} className="btn-primary">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// Delete Confirmation Modal Component
const DeleteConfirmationModal = ({ host, isOpen, onClose, onConfirm, isLoading }) => {
  if (!isOpen || !host) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-secondary-800 rounded-lg p-6 w-full max-w-md">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-danger-100 dark:bg-danger-900 rounded-full flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-danger-600 dark:text-danger-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">
              Delete Host
            </h3>
            <p className="text-sm text-secondary-600 dark:text-secondary-300">
              This action cannot be undone
            </p>
          </div>
        </div>
        
        <div className="mb-6">
          <p className="text-secondary-700 dark:text-secondary-300">
            Are you sure you want to delete the host{' '}
            <span className="font-semibold">"{host.friendlyName}"</span>?
          </p>
          <div className="mt-3 p-3 bg-danger-50 dark:bg-danger-900 border border-danger-200 dark:border-danger-700 rounded-md">
            <p className="text-sm text-danger-800 dark:text-danger-200">
              <strong>Warning:</strong> This will permanently remove the host and all its associated data, 
              including package information and update history.
            </p>
          </div>
        </div>
        
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="btn-outline"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="btn-danger"
            disabled={isLoading}
          >
            {isLoading ? 'Deleting...' : 'Delete Host'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default HostDetail

 