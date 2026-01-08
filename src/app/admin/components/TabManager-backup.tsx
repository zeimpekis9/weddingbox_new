'use client'

import { useState } from 'react'
import { Eye, EyeOff, Settings, Download } from 'lucide-react'
import { Database } from '@/lib/supabase'
import ImageViewerModal from '@/components/ImageViewerModal'

type Event = Database['public']['Tables']['events']['Row']
type EventSettings = Database['public']['Tables']['event_settings']['Row']
type Submission = Database['public']['Tables']['submissions']['Row']

interface TabManagerProps {
  event: Event
  settings: EventSettings | null
  submissions: Submission[]
  onUpdateSettings: (settings: Partial<EventSettings>) => void
  onToggleApproval: (id: string, approved: boolean) => void
  onDeleteSubmission: (id: string) => void
}

export default function TabManager({ 
  event, 
  settings, 
  submissions, 
  onUpdateSettings, 
  onToggleApproval, 
  onDeleteSubmission 
}: TabManagerProps) {
  const [activeAdminTab, setActiveAdminTab] = useState('ceremony')
  const [showImageViewer, setShowImageViewer] = useState(false)
  const [selectedImage, setSelectedImage] = useState<{
    url: string
    type: string
    guestName?: string
    createdAt?: string
  } | null>(null)

  const getTabSubmissions = (tab: string) => {
    if (!settings) return []
    
    let contentType = 'all'
    if (tab === 'ceremony') contentType = settings.tab_ceremony_content || 'all'
    if (tab === 'afterparty') contentType = settings.tab_afterparty_content || 'all'
    if (tab === 'album') contentType = settings.tab_album_content || 'all'
    
    return contentType === 'all' 
      ? submissions 
      : submissions.filter(s => s.type === contentType)
  }

  const handleImageClick = (submission: Submission) => {
    if (submission.content_url) {
      setSelectedImage({
        url: submission.content_url,
        type: submission.type,
        guestName: submission.guest_name || undefined,
        createdAt: submission.created_at
      })
      setShowImageViewer(true)
    }
  }

  const getTabName = (tab: string) => {
    if (!settings) return tab.charAt(0).toUpperCase() + tab.slice(1)
    if (tab === 'ceremony') return settings.tab_ceremony_name || 'Ceremony'
    if (tab === 'afterparty') return settings.tab_afterparty_name || 'After Party'
    if (tab === 'album') return settings.tab_album_name || 'Album'
    return tab
  }

  const getTabContent = (tab: string) => {
    if (!settings) return 'all'
    if (tab === 'ceremony') return settings.tab_ceremony_content || 'all'
    if (tab === 'afterparty') return settings.tab_afterparty_content || 'all'
    if (tab === 'album') return settings.tab_album_content || 'all'
    return 'all'
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-medium text-gray-900">Tab Management</h2>
      </div>
      
      {/* Tab Configuration */}
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-md font-medium text-gray-800 mb-4">Tab Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {['ceremony', 'afterparty', 'album'].map((tab) => (
            <div key={tab} className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700 capitalize">
                  {tab} Tab
                </label>
                <input
                  type="checkbox"
                  checked={
                    tab === 'ceremony' ? settings?.show_ceremony_tab :
                    tab === 'afterparty' ? settings?.show_afterparty_tab :
                    settings?.show_album_tab
                  }
                  onChange={(e) => {
                    const updateData: any = {}
                    if (tab === 'ceremony') updateData.show_ceremony_tab = e.target.checked
                    if (tab === 'afterparty') updateData.show_afterparty_tab = e.target.checked
                    if (tab === 'album') updateData.show_album_tab = e.target.checked
                    onUpdateSettings(updateData)
                  }}
                  className="rounded"
                />
              </div>
              
              <input
                type="text"
                value={getTabName(tab)}
                onChange={(e) => {
                  const updateData: any = {}
                  if (tab === 'ceremony') updateData.tab_ceremony_name = e.target.value
                  if (tab === 'afterparty') updateData.tab_afterparty_name = e.target.value
                  if (tab === 'album') updateData.tab_album_name = e.target.value
                  onUpdateSettings(updateData)
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="Tab name"
              />
              
              <select
                value={getTabContent(tab)}
                onChange={(e) => {
                  const updateData: any = {}
                  if (tab === 'ceremony') updateData.tab_ceremony_content = e.target.value
                  if (tab === 'afterparty') updateData.tab_afterparty_content = e.target.value
                  if (tab === 'album') updateData.tab_album_content = e.target.value
                  onUpdateSettings(updateData)
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="all">All Content</option>
                <option value="photo">Photos Only</option>
                <option value="video">Videos Only</option>
                <option value="message">Messages Only</option>
                <option value="voice">Voicemails Only</option>
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Tab Content Viewer */}
      <div className="p-4">
        <h3 className="text-md font-medium text-gray-800 mb-4">Tab Content Viewer</h3>
        
        {/* Admin Tabs */}
        <div className="flex border-b border-gray-200 mb-4">
          {['ceremony', 'afterparty', 'album'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveAdminTab(tab)}
              className={`px-4 py-2 font-medium transition-colors ${
                activeAdminTab === tab 
                  ? 'text-blue-600 border-b-2 border-blue-600' 
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              {getTabName(tab)}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="space-y-4">
          {getTabSubmissions(activeAdminTab).length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No content in this tab</p>
            </div>
          ) : (
            getTabSubmissions(activeAdminTab).map((submission) => (
              <div key={submission.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        submission.type === 'photo' ? 'bg-blue-100 text-blue-800' :
                        submission.type === 'video' ? 'bg-purple-100 text-purple-800' :
                        submission.type === 'message' ? 'bg-green-100 text-green-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {submission.type}
                      </span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        submission.approved ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {submission.approved ? 'Approved' : 'Pending'}
                      </span>
                    </div>
                    
                    {submission.guest_name && (
                      <p className="text-sm text-gray-600 mb-1">From: {submission.guest_name}</p>
                    )}
                    
                    {submission.message_text && (
                      <p className="text-gray-700 mb-2">{submission.message_text}</p>
                    )}
                    
                    {submission.content_url && (
                      <div className="mb-2">
                        {submission.type === 'photo' ? (
                          <div 
                            onClick={() => handleImageClick(submission)}
                            className="cursor-pointer hover:opacity-90 transition-opacity"
                          >
                            <img src={submission.content_url} alt="Submission" className="max-w-xs h-32 object-cover rounded" />
                          </div>
                        ) : submission.type === 'video' ? (
                          <div 
                            onClick={() => handleImageClick(submission)}
                            className="cursor-pointer hover:opacity-90 transition-opacity"
                          >
                            <video src={submission.content_url} className="max-w-xs h-32 object-cover rounded" controls />
                          </div>
                        ) : submission.type === 'voice' ? (
                          <audio src={submission.content_url} controls />
                        ) : null}
                      </div>
                    )}
                    
                    <p className="text-xs text-gray-500">
                      {new Date(submission.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  
                  <div className="flex items-center space-x-2 ml-4">
                    <button
                      onClick={() => onToggleApproval(submission.id, !submission.approved)}
                      className="text-gray-400 hover:text-gray-600"
                      title={submission.approved ? 'Hide from public' : 'Show to public'}
                    >
                      {submission.approved ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                    <button
                      onClick={() => onDeleteSubmission(submission.id)}
                      className="text-red-400 hover:text-red-600"
                      title="Delete submission"
                    >
                      <Trash2 className="w-5 h-5" />
                    </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>

    {/* Image Viewer Modal */}
    {showImageViewer && selectedImage && (
      <ImageViewerModal
        isOpen={showImageViewer}
        onClose={() => setShowImageViewer(false)}
        imageUrl={selectedImage.url}
        type={selectedImage.type}
        guestName={selectedImage.guestName}
        createdAt={selectedImage.createdAt}
      />
    )}
  </div>
)
