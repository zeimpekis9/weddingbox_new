'use client'

import { useState } from 'react'
import { Eye, EyeOff, Trash2 } from 'lucide-react'
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
    if (!submission.content_url) return

    setSelectedImage({
      url: submission.content_url,
      type: submission.type,
      guestName: submission.guest_name || undefined,
      createdAt: submission.created_at
    })
    setShowImageViewer(true)
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
        <h3 className="text-md font-medium text-gray-800 mb-4">
          Tab Configuration
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {['ceremony', 'afterparty', 'album'].map(tab => (
            <div key={tab} className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700 capitalize">
                  {tab} Tab
                </label>

                <input
                  type="checkbox"
                  checked={
                    tab === 'ceremony'
                      ? settings?.show_ceremony_tab
                      : tab === 'afterparty'
                      ? settings?.show_afterparty_tab
                      : settings?.show_album_tab
                  }
                  onChange={e => {
                    const updateData: Partial<EventSettings> = {}
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
                onChange={e => {
                  const updateData: Partial<EventSettings> = {}
                  if (tab === 'ceremony') updateData.tab_ceremony_name = e.target.value
                  if (tab === 'afterparty') updateData.tab_afterparty_name = e.target.value
                  if (tab === 'album') updateData.tab_album_name = e.target.value
                  onUpdateSettings(updateData)
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />

              <select
                value={getTabContent(tab)}
                onChange={e => {
                  const updateData: Partial<EventSettings> = {}
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
        <h3 className="text-md font-medium text-gray-800 mb-4">
          Tab Content Viewer
        </h3>

        <div className="flex border-b border-gray-200 mb-4">
          {['ceremony', 'afterparty', 'album'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveAdminTab(tab)}
              className={`px-4 py-2 font-medium ${
                activeAdminTab === tab
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              {getTabName(tab)}
            </button>
          ))}
        </div>

        {getTabSubmissions(activeAdminTab).length === 0 ? (
          <p className="text-center text-gray-500 py-8">
            No content in this tab
          </p>
        ) : (
          getTabSubmissions(activeAdminTab).map(submission => (
            <div
              key={submission.id}
              className="border border-gray-200 rounded-lg p-4 mb-4"
            >
              <div className="flex justify-between">
                <div>
                  <p className="text-sm text-gray-600">
                    {submission.guest_name}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(submission.created_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      onToggleApproval(submission.id, !submission.approved)
                    }
                  >
                    {submission.approved ? <EyeOff /> : <Eye />}
                  </button>

                  <button
                    onClick={() => onDeleteSubmission(submission.id)}
                    className="text-red-500"
                  >
                    <Trash2 />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

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
}
