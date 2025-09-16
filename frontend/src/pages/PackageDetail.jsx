import React from 'react'
import { useParams } from 'react-router-dom'
import { Package } from 'lucide-react'

const PackageDetail = () => {
  const { packageId } = useParams()
  
  return (
    <div className="space-y-6">
      
      <div className="card p-8 text-center">
        <Package className="h-12 w-12 text-secondary-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-secondary-900 mb-2">Package Details</h3>
        <p className="text-secondary-600">
          Detailed view for package: {packageId}
        </p>
        <p className="text-secondary-600 mt-2">
          This page will show package information, affected hosts, version distribution, and more.
        </p>
      </div>
    </div>
  )
}

export default PackageDetail 