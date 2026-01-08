'use client'

import { useState } from 'react'
import { X, Plus } from 'lucide-react'

interface CreateEventModalProps {
  isOpen: boolean
  onClose: () => void
  onCreateEvent: (eventData: any, coverPhoto: File | null) => void
}

export default function CreateEventModal({ isOpen, onClose, onCreateEvent }: CreateEventModalProps) {
  const [eventData, setEventData] = useState({
    title: '',
    date: '',
    welcome_message: '',
    slug: ''
  })
  const [coverPhotoFile, setCoverPhotoFile] = useState<File | null>(null)

  const handleSubmit = () => {
    if (!eventData.title || !eventData.date || !eventData.welcome_message || !eventData.slug) {
      alert('Please fill in all required fields')
      return
    }
    
    onCreateEvent(eventData, coverPhotoFile)
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Create New Event</h2>
            <button
              onClick={() => {
                onClose()
                setEventData({ title: '', date: '', welcome_message: '', slug: '' })
                setCoverPhotoFile(null)
              }}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Event Title</label>
              <input
                type="text"
                value={eventData.title}
                onChange={(e) => setEventData({ ...eventData, title: e.target.value })}
                placeholder="John & Sarah's Wedding"
                className="input-field w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Event Date</label>
              <input
                type="date"
                value={eventData.date}
                onChange={(e) => setEventData({ ...eventData, date: e.target.value })}
                className="input-field w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Welcome Message</label>
              <textarea
                value={eventData.welcome_message}
                onChange={(e) => setEventData({ ...eventData, welcome_message: e.target.value })}
                placeholder="Welcome to our wedding celebration!..."
                rows={3}
                className="input-field w-full resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">URL Slug</label>
              <input
                type="text"
                value={eventData.slug}
                onChange={(e) => setEventData({ ...eventData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                placeholder="john-sarah-wedding"
                className="input-field w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Cover Photo (Optional)</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setCoverPhotoFile(e.target.files?.[0] || null)}
                className="input-field w-full"
              />
              {coverPhotoFile && (
                <p className="text-sm text-gray-500 mt-1">Selected: {coverPhotoFile.name}</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  onClose()
                  setEventData({ title: '', date: '', welcome_message: '', slug: '' })
                  setCoverPhotoFile(null)
                }}
                className="flex-1 px-4 py-3 text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!eventData.title || !eventData.date || !eventData.welcome_message || !eventData.slug}
                className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4 mr-2 inline" />
                Create Event
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
