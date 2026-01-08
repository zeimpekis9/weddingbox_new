'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/lib/supabase'
import { Heart, LogOut, Trash2, AlertTriangle } from 'lucide-react'
import LoginForm from './components/LoginForm'
import EventSidebar from './components/EventSidebar'
import CreateEventModal from './components/CreateEventModal'
import EditEventModal from './components/EditEventModal'
import FontSelector from './components/FontSelector'
import ColorSelector from './components/ColorSelector'
import TabManager from './components/TabManager'
import ApprovalSettings from './components/ApprovalSettings'

type Event = Database['public']['Tables']['events']['Row']
type EventSettings = Database['public']['Tables']['event_settings']['Row']
type Submission = Database['public']['Tables']['submissions']['Row']

export default function AdminDashboard() {
  const [user, setUser] = useState<any>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [eventSettings, setEventSettings] = useState<EventSettings | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkUser()
  }, [])

  useEffect(() => {
    if (user) {
      fetchEvents()
    }
  }, [user])

  useEffect(() => {
    if (selectedEvent) {
      fetchEventSettings()
      fetchSubmissions()
    }
  }, [selectedEvent])

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)
  }

  const handleLogin = (userData: any) => {
    setUser(userData)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  const fetchEvents = async () => {
    const { data } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false })

    setEvents(data || [])
    setLoading(false)
  }

  const fetchEventSettings = async () => {
    if (!selectedEvent) return
    
    const { data } = await supabase
      .from('event_settings')
      .select('*')
      .eq('event_id', selectedEvent.id)
      .single()

    setEventSettings(data)
  }

  const fetchSubmissions = async () => {
    if (!selectedEvent) return
    
    const { data } = await supabase
      .from('submissions')
      .select('*')
      .eq('event_id', selectedEvent.id)
      .order('created_at', { ascending: false })

    setSubmissions(data || [])
  }

  const createEvent = async (eventData: any, coverPhoto: File | null) => {
    try {
      console.log('Creating event:', eventData)
      
      const { data: newEvent, error } = await supabase
        .from('events')
        .insert(eventData)
        .select()
        .single()

      if (error) throw error

      // Create event settings
      await supabase
        .from('event_settings')
        .insert({
          event_id: newEvent.id,
          collect_photos: true,
          collect_messages: true,
          collect_voicemails: true,
          moderation_enabled: false
        })

      // Upload cover photo if provided
      if (coverPhoto) {
        const fileName = `cover-${Date.now()}.${coverPhoto.name.split('.').pop()}`
        const filePath = `${newEvent.id}/photos/${fileName}`

        await supabase.storage
          .from('wedding-media')
          .upload(filePath, coverPhoto)

        const { data: { publicUrl } } = supabase.storage
          .from('wedding-media')
          .getPublicUrl(filePath)

        await supabase
          .from('events')
          .update({ cover_photo_url: publicUrl })
          .eq('id', newEvent.id)
      }

      setShowCreateModal(false)
      fetchEvents()
      alert('Event created successfully!')
    } catch (error: any) {
      console.error('Error creating event:', error)
      alert('Failed to create event: ' + error.message)
    }
  }

  const updateEvent = async (eventData: any, coverPhoto: File | null) => {
    if (!selectedEvent) return

    try {
      const { error } = await supabase
        .from('events')
        .update(eventData)
        .eq('id', selectedEvent.id)

      if (error) throw error

      // Upload new cover photo if provided
      if (coverPhoto) {
        const fileName = `cover-${Date.now()}.${coverPhoto.name.split('.').pop()}`
        const filePath = `${selectedEvent.id}/photos/${fileName}`

        await supabase.storage
          .from('wedding-media')
          .upload(filePath, coverPhoto)

        const { data: { publicUrl } } = supabase.storage
          .from('wedding-media')
          .getPublicUrl(filePath)

        await supabase
          .from('events')
          .update({ cover_photo_url: publicUrl })
          .eq('id', selectedEvent.id)
      }

      setShowEditModal(false)
      fetchEvents()
      alert('Event updated successfully!')
    } catch (error: any) {
      console.error('Error updating event:', error)
      alert('Failed to update event: ' + error.message)
    }
  }

  const updateEventFont = async (font: string) => {
    if (!selectedEvent) return

    try {
      const { error } = await supabase
        .from('events')
        .update({ primary_font: font })
        .eq('id', selectedEvent.id)

      if (error) throw error

      // Update local state
      setSelectedEvent({ ...selectedEvent, primary_font: font })
      
      // Refetch event data to ensure latest updates
      const { data: updatedEvent } = await supabase
        .from('events')
        .select('*')
        .eq('id', selectedEvent.id)
        .single()
      
      if (updatedEvent) {
        setSelectedEvent(updatedEvent)
      }
    } catch (error: any) {
      console.error('Error updating font:', error)
      alert('Failed to update font: ' + error.message)
    }
  }

  const updateEventColor = async (type: 'primary' | 'secondary' | 'accent', color: string) => {
    if (!selectedEvent) return

    console.log('Updating color:', type, color)
    
    try {
      const updateData: any = {}
      if (type === 'primary') updateData.primary_color = color
      if (type === 'secondary') updateData.secondary_color = color
      if (type === 'accent') updateData.accent_color = color

      console.log('Update data:', updateData)

      const { error } = await supabase
        .from('events')
        .update(updateData)
        .eq('id', selectedEvent.id)

      console.log('Database response:', { error })

      if (error) {
        console.error('Database error:', error)
        throw error
      }

      // Update local state
      setSelectedEvent({ ...selectedEvent, ...updateData })
      console.log('Color updated successfully!')
    } catch (error: any) {
      console.error('Error updating color:', error)
      alert('Failed to update color: ' + error.message)
    }
  }

  const deleteEvent = async () => {
    if (!selectedEvent) return

    const confirmDelete = window.confirm(
      `Are you sure you want to delete "${selectedEvent.title}"? This action cannot be undone and will also delete all submissions and settings for this event.`
    )

    if (!confirmDelete) return

    try {
      // First delete all submissions for this event
      const { error: submissionsError } = await supabase
        .from('submissions')
        .delete()
        .eq('event_id', selectedEvent.id)

      if (submissionsError) {
        console.error('Error deleting submissions:', submissionsError)
        // Continue anyway, as the main goal is to delete the event
      }

      // Delete event settings
      const { error: settingsError } = await supabase
        .from('event_settings')
        .delete()
        .eq('event_id', selectedEvent.id)

      if (settingsError) {
        console.error('Error deleting settings:', settingsError)
        // Continue anyway
      }

      // Delete the event
      const { error: eventError } = await supabase
        .from('events')
        .delete()
        .eq('id', selectedEvent.id)

      if (eventError) throw eventError

      // Update local state
      setEvents(events.filter(e => e.id !== selectedEvent.id))
      setSelectedEvent(null)
      setEventSettings(null)
      setSubmissions([])

      alert(`Event "${selectedEvent.title}" has been deleted successfully.`)
    } catch (error: any) {
      console.error('Error deleting event:', error)
      alert('Failed to delete event: ' + error.message)
    }
  }

  const updateSettings = async (settingsUpdate: Partial<EventSettings>) => {
    if (!selectedEvent || !eventSettings) return

    try {
      const { error } = await supabase
        .from('event_settings')
        .update(settingsUpdate)
        .eq('id', eventSettings.id)

      if (error) throw error

      // Update local state
      setEventSettings({ ...eventSettings, ...settingsUpdate })
    } catch (error: any) {
      console.error('Error updating settings:', error)
      alert('Failed to update settings: ' + error.message)
    }
  }

  const toggleSubmissionApproval = async (id: string, approved: boolean) => {
    try {
      const { error } = await supabase
        .from('submissions')
        .update({ approved })
        .eq('id', id)

      if (error) throw error

      // Update local state
      setSubmissions(submissions.map(s => 
        s.id === id ? { ...s, approved } : s
      ))
    } catch (error: any) {
      console.error('Error updating submission:', error)
      alert('Failed to update submission: ' + error.message)
    }
  }

  const deleteSubmission = async (id: string) => {
    if (!confirm('Are you sure you want to delete this submission?')) return

    try {
      const { error } = await supabase
        .from('submissions')
        .delete()
        .eq('id', id)

      if (error) throw error

      // Update local state
      setSubmissions(submissions.filter(s => s.id !== id))
    } catch (error: any) {
      console.error('Error deleting submission:', error)
      alert('Failed to delete submission: ' + error.message)
    }
  }

  if (!user) {
    return <LoginForm onLogin={handleLogin} />
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-2xl font-bold text-gray-900">Wedding Admin</h1>
            <button
              onClick={handleLogout}
              className="flex items-center text-gray-600 hover:text-gray-900"
            >
              <LogOut className="w-5 h-5 mr-2" />
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar */}
          <EventSidebar 
            events={events}
            selectedEvent={selectedEvent}
            onSelectEvent={setSelectedEvent}
          />

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-8">
            {/* Quick Actions */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-medium text-gray-900">Quick Actions</h2>
              </div>
              <div className="p-4 space-y-3">
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="btn-primary flex items-center"
                >
                  Create New Event
                </button>
                {selectedEvent && (
                  <button
                    onClick={() => setShowEditModal(true)}
                    className="btn-secondary flex items-center"
                  >
                    Edit Event Details
                  </button>
                )}
              </div>
            </div>

            {/* Event Details */}
            {selectedEvent && (
              <div className="bg-white rounded-lg shadow">
                <div className="p-4 border-b border-gray-200">
                  <h2 className="text-lg font-medium text-gray-900">Event Details</h2>
                </div>
                <div className="p-4">
                  <h3 className="text-xl font-semibold text-gray-900">{selectedEvent.title}</h3>
                  <p className="text-gray-600 mt-1">{new Date(selectedEvent.date).toLocaleDateString()}</p>
                  <p className="text-gray-700 mt-2">{selectedEvent.welcome_message}</p>
                  <p className="text-sm text-gray-500 mt-2">URL: /{selectedEvent.slug}</p>
                  
                  {/* Delete Event Button */}
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <button
                      onClick={deleteEvent}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete Event
                    </button>
                  </div>
                  
                  {/* Font Selector */}
                  <div className="mt-6 pt-4 border-t border-gray-200">
                    <FontSelector
                      selectedFont={selectedEvent.primary_font || 'Playfair Display'}
                      onFontChange={(font) => {
                        updateEventFont(font)
                      }}
                    />
                  </div>

                  {/* Color Selector */}
                  <div className="mt-6 pt-4 border-t border-gray-200">
                    <ColorSelector
                      primaryColor={selectedEvent.primary_color || '#a67c52'}
                      secondaryColor={selectedEvent.secondary_color || '#ede1d1'}
                      accentColor={selectedEvent.accent_color || '#704a3a'}
                      onColorChange={updateEventColor}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Tab Manager */}
            {selectedEvent && (
              <TabManager
                event={selectedEvent}
                settings={eventSettings}
                submissions={submissions}
                onUpdateSettings={updateSettings}
                onToggleApproval={toggleSubmissionApproval}
                onDeleteSubmission={deleteSubmission}
              />
            )}

            {/* Approval Settings */}
            {selectedEvent && (
              <ApprovalSettings
                manualApproval={eventSettings?.manual_approval || false}
                autoApprovalDelay={eventSettings?.auto_approval_delay || 5}
                onManualApprovalChange={(enabled) => {
                  updateSettings({ manual_approval: enabled })
                }}
                onDelayChange={(delay) => {
                  updateSettings({ auto_approval_delay: delay })
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <CreateEventModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreateEvent={createEvent}
      />

      <EditEventModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        event={selectedEvent}
        onUpdateEvent={updateEvent}
      />
    </div>
  )
}
