import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { 
  Server, 
  Shield, 
  ShieldCheck, 
  AlertTriangle,
  Users,
  Globe,
  Lock,
  Unlock,
  Database,
  Eye
} from 'lucide-react';
import { repositoryAPI } from '../utils/api';

const Repositories = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all'); // all, secure, insecure
  const [filterStatus, setFilterStatus] = useState('all'); // all, active, inactive

  // Fetch repositories
  const { data: repositories = [], isLoading, error } = useQuery({
    queryKey: ['repositories'],
    queryFn: () => repositoryAPI.list().then(res => res.data)
  });

  // Fetch repository statistics
  const { data: stats } = useQuery({
    queryKey: ['repository-stats'],
    queryFn: () => repositoryAPI.getStats().then(res => res.data)
  });

  // Filter repositories based on search and filters
  const filteredRepositories = repositories.filter(repo => {
    const matchesSearch = repo.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         repo.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         repo.distribution.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === 'all' || 
                       (filterType === 'secure' && repo.isSecure) ||
                       (filterType === 'insecure' && !repo.isSecure);
    
    const matchesStatus = filterStatus === 'all' ||
                         (filterStatus === 'active' && repo.isActive) ||
                         (filterStatus === 'inactive' && !repo.isActive);
    
    return matchesSearch && matchesType && matchesStatus;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <div className="flex items-center">
          <AlertTriangle className="h-5 w-5 text-red-400 mr-2" />
          <span className="text-red-700 dark:text-red-300">
            Failed to load repositories: {error.message}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">
            Repositories
          </h1>
          <p className="text-secondary-500 dark:text-secondary-300 mt-1">
            Manage and monitor package repositories across your infrastructure
          </p>
        </div>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-secondary-800 rounded-lg shadow hover:shadow-md transition-shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Database className="h-8 w-8 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-secondary-500 dark:text-secondary-300">Total Repositories</p>
                <p className="text-2xl font-bold text-secondary-900 dark:text-white">{stats.totalRepositories}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-secondary-800 rounded-lg shadow hover:shadow-md transition-shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Server className="h-8 w-8 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-secondary-500 dark:text-secondary-300">Active Repositories</p>
                <p className="text-2xl font-bold text-secondary-900 dark:text-white">{stats.activeRepositories}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-secondary-800 rounded-lg shadow hover:shadow-md transition-shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Shield className="h-8 w-8 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-secondary-500 dark:text-secondary-300">Secure (HTTPS)</p>
                <p className="text-2xl font-bold text-secondary-900 dark:text-white">{stats.secureRepositories}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-secondary-800 rounded-lg shadow hover:shadow-md transition-shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="relative">
                  <ShieldCheck className="h-8 w-8 text-green-600" />
                  <span className="absolute -top-1 -right-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs font-medium px-1.5 py-0.5 rounded-full">
                    {stats.securityPercentage}%
                  </span>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-secondary-500 dark:text-secondary-300">Security Score</p>
                <p className="text-2xl font-bold text-secondary-900 dark:text-white">{stats.securityPercentage}%</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-white dark:bg-secondary-800 rounded-lg shadow p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search repositories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-secondary-300 dark:border-secondary-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-secondary-700 dark:text-white"
            />
          </div>

          {/* Security Filter */}
          <div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 border border-secondary-300 dark:border-secondary-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-secondary-700 dark:text-white"
            >
              <option value="all">All Security Types</option>
              <option value="secure">HTTPS Only</option>
              <option value="insecure">HTTP Only</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 border border-secondary-300 dark:border-secondary-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-secondary-700 dark:text-white"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Repositories List */}
      <div className="bg-white dark:bg-secondary-800 rounded-lg shadow">
        <div className="px-6 py-4 border-b border-secondary-200 dark:border-secondary-700">
          <h2 className="text-lg font-semibold text-secondary-900 dark:text-white">
            Repositories ({filteredRepositories.length})
          </h2>
        </div>

        {filteredRepositories.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Database className="mx-auto h-12 w-12 text-secondary-400" />
            <h3 className="mt-2 text-sm font-medium text-secondary-900 dark:text-white">No repositories found</h3>
            <p className="mt-1 text-sm text-secondary-500 dark:text-secondary-300">
              {searchTerm || filterType !== 'all' || filterStatus !== 'all' 
                ? 'Try adjusting your search or filters.' 
                : 'No repositories have been reported by your hosts yet.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-secondary-200 dark:divide-secondary-700">
            {filteredRepositories.map((repo) => (
              <div key={repo.id} className="px-6 py-4 hover:bg-secondary-50 dark:hover:bg-secondary-700/50">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        {repo.isSecure ? (
                          <Lock className="h-4 w-4 text-green-600" />
                        ) : (
                          <Unlock className="h-4 w-4 text-orange-600" />
                        )}
                        <h3 className="text-lg font-medium text-secondary-900 dark:text-white">
                          {repo.name}
                        </h3>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          repo.isActive
                            ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300'
                            : 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-300'
                        }`}>
                          {repo.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="mt-2 space-y-1">
                      <p className="text-sm text-secondary-600 dark:text-secondary-300">
                        <Globe className="inline h-4 w-4 mr-1" />
                        {repo.url}
                      </p>
                      <div className="flex items-center gap-4 text-sm text-secondary-500 dark:text-secondary-400">
                        <span>Distribution: <span className="font-medium">{repo.distribution}</span></span>
                        <span>Type: <span className="font-medium">{repo.repoType}</span></span>
                        <span>Components: <span className="font-medium">{repo.components}</span></span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Host Count */}
                    <div className="text-center">
                      <div className="flex items-center gap-1 text-sm text-secondary-500 dark:text-secondary-400">
                        <Users className="h-4 w-4" />
                        <span>{repo.hostCount} hosts</span>
                      </div>
                    </div>

                    {/* View Details */}
                    <Link
                      to={`/repositories/${repo.id}`}
                      className="btn-outline text-sm flex items-center gap-1"
                    >
                      <Eye className="h-4 w-4" />
                      View
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Repositories;
