'use client'

import { Clock, Shield, Settings } from 'lucide-react'

interface ApprovalSettingsProps {
  manualApproval: boolean
  autoApprovalDelay: number
  onManualApprovalChange: (enabled: boolean) => void
  onDelayChange: (delay: number) => void
}

export default function ApprovalSettings({ 
  manualApproval, 
  autoApprovalDelay, 
  onManualApprovalChange, 
  onDelayChange 
}: ApprovalSettingsProps) {
  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <Shield className="w-4 h-4 mr-2" />
          <h3 className="text-md font-medium text-gray-800">Approval Settings</h3>
        </div>
      </div>
      
      <div className="p-4 space-y-6">
        {/* Manual Approval Toggle */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">
              Manual Approval
            </label>
            <div className="flex items-center space-x-2">
              <span className="text-xs text-gray-500">
                {manualApproval ? 'Enabled' : 'Disabled'}
              </span>
              <button
                onClick={() => onManualApprovalChange(!manualApproval)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  manualApproval ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    manualApproval ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            {manualApproval 
              ? 'All submissions require manual approval before appearing in the live feed'
              : 'Submissions will be auto-approved based on your delay settings'
            }
          </p>
        </div>

        {/* Auto-Approval Delay */}
        {!manualApproval && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 flex items-center">
                <Clock className="w-4 h-4 mr-2" />
                Auto-Approval Delay
              </label>
              <span className="text-sm font-medium text-gray-900">
                {autoApprovalDelay} seconds
              </span>
            </div>
            <div className="space-y-2">
              <input
                type="range"
                min="1"
                max="60"
                value={autoApprovalDelay}
                onChange={(e) => onDelayChange(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-gray-500">
                <span>1s</span>
                <span>30s</span>
                <span>60s</span>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Submissions will automatically appear in the live feed after {autoApprovalDelay} seconds
            </p>
          </div>
        )}

        {/* Quick Settings */}
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => {
              onManualApprovalChange(false)
              onDelayChange(5)
            }}
            className="px-3 py-2 text-xs bg-green-100 text-green-800 rounded-lg hover:bg-green-200 transition-colors"
          >
            Quick (5s)
          </button>
          <button
            onClick={() => {
              onManualApprovalChange(false)
              onDelayChange(15)
            }}
            className="px-3 py-2 text-xs bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200 transition-colors"
          >
            Normal (15s)
          </button>
          <button
            onClick={() => {
              onManualApprovalChange(false)
              onDelayChange(30)
            }}
            className="px-3 py-2 text-xs bg-purple-100 text-purple-800 rounded-lg hover:bg-purple-200 transition-colors"
          >
            Slow (30s)
          </button>
        </div>
      </div>
    </div>
  )
}
