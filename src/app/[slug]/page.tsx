'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Database } from '@/lib/supabase'
import { Camera, MessageCircle, Mic, Heart, Calendar, MapPin, Share2 } from 'lucide-react'
import UploadModal from '@/components/UploadModal'
import MessageModal from '@/components/MessageModal'
import VoiceModal from '@/components/VoiceModal'
import ImageViewerModal from '@/components/ImageViewerModal'

type Event = Database['public']['Tables']['events']['Row']
type EventSettings = Database['public']['Tables']['event_settings']['Row']
type Submission = Database['public']['Tables']['submissions']['Row']

export default function EventPage() {
  const params = useParams()
  const slug = params.slug as string
  
  const [event, setEvent] = useState<Event | null>(null)
  const [settings, setSettings] = useState<EventSettings | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [activeTab, setActiveTab] = useState('ceremony')
  const [loading, setLoading] = useState(true)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showMessageModal, setShowMessageModal] = useState(false)
  const [showVoiceModal, setShowVoiceModal] = useState(false)
  const [showImageViewer, setShowImageViewer] = useState(false)
  const [selectedImage, setSelectedImage] = useState<{
    url: string
    type: string
    guestName?: string
    createdAt?: string
  } | null>(null)

  useEffect(() => {
    if (slug) {
      fetchEventData()
      fetchSubmissions()
      
      // Set up real-time subscription
      const submissionSubscription = supabase
        .channel(`submissions:${slug}`)
        .on('postgres_changes', 
          { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'submissions',
            filter: `approved=eq.true`
          }, 
          (payload) => {
            setSubmissions(prev => [payload.new as Submission, ...prev])
          }
        )
        .subscribe()

      // Set up real-time subscription for event updates
      const eventSubscription = supabase
        .channel(`event:${slug}`)
        .on('postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'events',
            filter: `slug=eq.${slug}`
          },
          (payload) => {
            setEvent(payload.new as Event)
            // Also refresh the entire page data to ensure everything updates
            fetchEventData()
          }
        )
        .subscribe()

      // Set up periodic refresh every 30 seconds as backup
      const refreshInterval = setInterval(() => {
        fetchEventData()
      }, 30000)

      return () => {
        submissionSubscription.unsubscribe()
        eventSubscription.unsubscribe()
        clearInterval(refreshInterval)
      }
    }
  }, [slug])

  const fetchEventData = async () => {
    const { data: eventData } = await supabase
      .from('events')
      .select('*')
      .eq('slug', slug)
      .single()

    if (eventData) {
      setEvent(eventData)
      
      const { data: settingsData } = await supabase
        .from('event_settings')
        .select('*')
        .eq('event_id', eventData.id)
        .single()
      
      setSettings(settingsData)
    }
  }

  const fetchSubmissions = async () => {
    const { data: eventData } = await supabase
      .from('events')
      .select('id')
      .eq('slug', slug)
      .single()

    if (eventData) {
      const { data: submissionsData } = await supabase
        .from('submissions')
        .select('*')
        .eq('event_id', eventData.id)
        .eq('approved', true)
        .order('created_at', { ascending: false })

      setSubmissions(submissionsData || [])
    }
    setLoading(false)
  }

  const getFilteredSubmissions = () => {
    if (!settings) return submissions
    
    switch (activeTab) {
      case 'ceremony':
        return settings.tab_ceremony_content === 'all' 
          ? submissions 
          : submissions.filter(s => s.type === settings.tab_ceremony_content)
      case 'afterparty':
        return settings.tab_afterparty_content === 'all'
          ? submissions
          : submissions.filter(s => s.type === settings.tab_afterparty_content)
      case 'album':
        return settings.tab_album_content === 'all'
          ? submissions
          : submissions.filter(s => s.type === settings.tab_album_content)
      default:
        return submissions
    }
  }

  const getFontClass = (fontName: string) => {
  const fontMap: { [key: string]: string } = {
    'Playfair Display': 'font-display',
    'Georgia': 'font-georgia',
    'Baskerville': 'font-baskerville',
    'Times New Roman': 'font-times',
    'Arial': 'font-arial',
    'Helvetica': 'font-helvetica',
    'Verdana': 'font-verdana',
    'Trebuchet MS': 'font-trebuchet',
    'Palatino': 'font-palatino',
    'Garamond': 'font-garamond',
    'Caslon': 'font-caslon',
    'Amanda Black': 'font-amanda'
  }
  return fontMap[fontName] || 'font-display'
}

const handleShare = async () => {
    if (!event) return
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: event.title,
          text: event.welcome_message,
          url: window.location.href
        })
      } catch (error) {
        console.log('Error sharing:', error)
      }
    } else {
      // Fallback for browsers that don't support Web Share API
      navigator.clipboard.writeText(window.location.href)
      alert('Wedding link copied to clipboard!')
    }
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading wedding memories...</p>
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Event Not Found</h1>
          <p className="text-gray-600">This wedding event doesn't exist.</p>
        </div>
      </div>
    )
  }

  return (
    <div 
      className="min-h-screen relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${event.accent_color || '#704a3a'} 0%, ${event.secondary_color || '#ede1d1'} 50%, ${event.accent_color || '#704a3a'} 100%)`,
        position: 'relative'
      }}
    >
      {/* Animated Background Effects */}
      <div className="absolute inset-0 overflow-hidden" style={{ zIndex: 0 }}>
        {/* Floating snow effect */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 left-0 w-2 h-2 bg-white rounded-full animate-pulse" style={{ animation: 'float 15s infinite ease-in-out', left: '10%', animationDelay: '0s' }}></div>
          <div className="absolute top-0 left-0 w-3 h-3 bg-white rounded-full animate-pulse" style={{ animation: 'float 20s infinite ease-in-out', left: '30%', animationDelay: '2s' }}></div>
          <div className="absolute top-0 left-0 w-2 h-2 bg-white rounded-full animate-pulse" style={{ animation: 'float 18s infinite ease-in-out', left: '50%', animationDelay: '4s' }}></div>
          <div className="absolute top-0 left-0 w-4 h-4 bg-white rounded-full animate-pulse" style={{ animation: 'float 25s infinite ease-in-out', left: '70%', animationDelay: '1s' }}></div>
          <div className="absolute top-0 left-0 w-2 h-2 bg-white rounded-full animate-pulse" style={{ animation: 'float 22s infinite ease-in-out', left: '90%', animationDelay: '3s' }}></div>
        </div>
        
        {/* Subtle overlay gradient */}
        <div 
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle at 50% 50%, transparent 0%, ${event.accent_color || '#704a3a'}40 100%)`
          }}
        ></div>
      </div>
      
      {/* Main Content */}
      <div style={{ position: 'relative', zIndex: 1 }}>
      {/* Main Event Card */}
      <div className="max-w-4xl mx-auto px-4 py-4 sm:py-6 lg:py-8">
        <div 
          className="w-full p-4 sm:p-6 lg:p-8 rounded-2xl shadow-2xl"
          style={{ 
            backgroundColor: event.secondary_color || '#ede1d1',
            border: `4px solid ${event.primary_color || '#a67c52'}`
          }}
        >
          {/* Cover Photo Area */}
          {event.cover_photo_url ? (
            <div 
              className="rounded-xl h-40 sm:h-48 lg:h-60 overflow-hidden mb-4 sm:mb-6"
              style={{ backgroundColor: event.secondary_color || '#ede1d1' }}
            >
              <img 
                src={event.cover_photo_url} 
                alt="Wedding Cover"
                className="w-full h-full object-cover filter grayscale"
              />
            </div>
          ) : (
            <div 
              className="rounded-xl h-60 flex items-center justify-center mb-6"
              style={{ 
                backgroundColor: event.secondary_color || '#ede1d1',
                border: `2px solid ${event.primary_color || '#a67c52'}`
              }}
            >
              <div className="text-center">
                <div 
                  className="w-16 h-16 rounded-full mx-auto mb-2 flex items-center justify-center"
                  style={{ backgroundColor: event.primary_color || '#a67c52' }}
                >
                  <Camera className="w-8 h-8 text-white" />
                </div>
                <p style={{ color: event.primary_color || '#a67c52' }} className="font-medium">
                  Cover Photo Missing
                </p>
              </div>
            </div>
          )}

          {/* Event Title */}
          <h1 
            className={`${getFontClass(event.primary_font || 'Playfair Display')} text-2xl sm:text-3xl lg:text-4xl text-center mb-3 sm:mb-4`}
            style={{ 
              color: event.accent_color || '#704a3a',
              fontFamily: event.primary_font === 'Playfair Display' 
                ? "'Playfair Display', Georgia, serif" 
                : event.primary_font === 'Georgia'
                ? "'Georgia', serif"
                : event.primary_font === 'Baskerville'
                ? "'Baskerville', serif"
                : event.primary_font === 'Times New Roman'
                ? "'Times New Roman', serif"
                : event.primary_font === 'Arial'
                ? "'Arial', sans-serif"
                : event.primary_font === 'Helvetica'
                ? "'Helvetica', sans-serif"
                : event.primary_font === 'Verdana'
                ? "'Verdana', sans-serif"
                : event.primary_font === 'Trebuchet MS'
                ? "'Trebuchet MS', sans-serif"
                : event.primary_font === 'Palatino'
                ? "'Palatino', serif"
                : event.primary_font === 'Garamond'
                ? "'Garamond', serif"
                : event.primary_font === 'Caslon'
                ? "'Caslon', serif"
                : event.primary_font === 'Amanda Black'
                ? "'Amanda Black', cursive"
                : "'Playfair Display', Georgia, serif"
            }}
          >
            {event.title}
          </h1>

          {/* Event Date */}
          <div 
            className="text-center mb-3 sm:mb-4 text-sm sm:text-base"
            style={{ color: event.primary_color || '#a67c52' }}
          >
            {new Date(event.date).toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </div>

          {/* Welcome Message */}
          <p 
            className={`${getFontClass(event.primary_font || 'Playfair Display')} text-center mb-4 sm:mb-6 text-lg sm:text-xl md:text-2xl font-bold leading-relaxed italic`}
            style={{ 
              color: event.primary_color || '#a67c52',
              textShadow: '2px 2px 4px rgba(0,0,0,0.1)',
              letterSpacing: '0.08em',
              fontFamily: event.primary_font === 'Playfair Display' 
                ? "'Playfair Display', Georgia, serif" 
                : event.primary_font === 'Georgia'
                ? "'Georgia', serif"
                : event.primary_font === 'Baskerville'
                ? "'Baskerville', serif"
                : event.primary_font === 'Times New Roman'
                ? "'Times New Roman', serif"
                : event.primary_font === 'Arial'
                ? "'Arial', sans-serif"
                : event.primary_font === 'Helvetica'
                ? "'Helvetica', sans-serif"
                : event.primary_font === 'Verdana'
                ? "'Verdana', sans-serif"
                : event.primary_font === 'Trebuchet MS'
                ? "'Trebuchet MS', sans-serif"
                : event.primary_font === 'Palatino'
                ? "'Palatino', serif"
                : event.primary_font === 'Garamond'
                ? "'Garamond', serif"
                : event.primary_font === 'Caslon'
                ? "'Caslon', serif"
                : event.primary_font === 'Amanda Black'
                ? "'Amanda Black', cursive"
                : event.primary_font || "'Playfair Display', Georgia, serif",
              fontStyle: 'italic',
              fontWeight: '700'
            }}
          >
            {event.welcome_message}
          </p>

          {/* Action Buttons */}
          {settings && (
            <div className="space-y-2 sm:space-y-3">
              {settings.collect_photos && (
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="w-full px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-medium transition-all duration-300 shadow-lg text-white transform hover:scale-105 hover:shadow-xl text-sm sm:text-base"
                  style={{ backgroundColor: event.primary_color || '#a67c52' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.05)'
                    e.currentTarget.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)'
                    e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'
                  }}
                >
                  <Camera className="w-4 h-4 sm:w-5 sm:h-5 mr-2 inline transition-transform duration-300" />
                  <span className="hidden sm:inline">Upload Media</span>
                  <span className="sm:hidden">Upload</span>
                </button>
              )}
              {settings.collect_messages && (
                <button
                  onClick={() => setShowMessageModal(true)}
                  className="w-full px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-medium transition-all duration-300 shadow-lg text-white transform hover:scale-105 hover:shadow-xl text-sm sm:text-base"
                  style={{ backgroundColor: event.primary_color || '#a67c52' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.05)'
                    e.currentTarget.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)'
                    e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'
                  }}
                >
                  <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5 mr-2 inline transition-transform duration-300" />
                  <span className="hidden sm:inline">Leave a Message</span>
                  <span className="sm:hidden">Message</span>
                </button>
              )}
              {settings.collect_voicemails && (
                <button
                  onClick={() => setShowVoiceModal(true)}
                  className="w-full px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-medium transition-all duration-300 shadow-lg text-white transform hover:scale-105 hover:shadow-xl text-sm sm:text-base"
                  style={{ backgroundColor: event.primary_color || '#a67c52' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.05)'
                    e.currentTarget.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)'
                    e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'
                  }}
                >
                  <Mic className="w-4 h-4 sm:w-5 sm:h-5 mr-2 inline transition-transform duration-300" />
                  <span className="hidden sm:inline">Leave a Voicemail</span>
                  <span className="sm:hidden">Voicemail</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Live Feed Section */}
      <div className="max-w-4xl mx-auto px-4 py-4 sm:py-6 lg:py-8">
        <div className="bg-wedding-100 border-4 border-wedding-700 rounded-2xl p-4 sm:p-6">
          {/* Tabs */}
          <div className="flex flex-col sm:flex-row border-b border-wedding-600 mb-6 space-y-2 sm:space-y-0">
            {settings?.show_ceremony_tab && (
              <button
                onClick={() => setActiveTab('ceremony')}
                className={`px-4 py-2 font-medium transition-colors flex-1 sm:flex-initial text-sm sm:text-base ${
                  activeTab === 'ceremony' 
                    ? 'text-wedding-900 border-b-2 border-wedding-600' 
                    : 'text-wedding-600 hover:text-wedding-800'
                }`}
              >
                {settings.tab_ceremony_name || 'Ceremony'}
              </button>
            )}
            {settings?.show_afterparty_tab && (
              <button
                onClick={() => setActiveTab('afterparty')}
                className={`px-4 py-2 font-medium transition-colors flex-1 sm:flex-initial text-sm sm:text-base ${
                  activeTab === 'afterparty' 
                    ? 'text-wedding-900 border-b-2 border-wedding-600' 
                    : 'text-wedding-600 hover:text-wedding-800'
                }`}
              >
                {settings.tab_afterparty_name || 'After Party'}
              </button>
            )}
            {settings?.show_album_tab && (
              <button
                onClick={() => setActiveTab('album')}
                className={`px-4 py-2 font-medium transition-colors flex-1 sm:flex-initial text-sm sm:text-base ${
                  activeTab === 'album' 
                    ? 'text-wedding-900 border-b-2 border-wedding-600' 
                    : 'text-wedding-600 hover:text-wedding-800'
                }`}
              >
                {settings.tab_album_name || 'Album'}
              </button>
            )}
            <button onClick={handleShare} className="ml-auto sm:ml-auto">
              <Share2 className="w-5 h-5 text-wedding-600 hover:text-wedding-800 cursor-pointer" />
            </button>
          </div>

          {/* Tab Content */}
          <div>
            <h2 className={`${getFontClass(event.primary_font || 'Playfair Display')} text-xl sm:text-2xl text-wedding-900 mb-4 sm:mb-6 text-center`}
            style={{
              fontFamily: event.primary_font === 'Playfair Display' 
                ? "'Playfair Display', Georgia, serif" 
                : event.primary_font === 'Georgia'
                ? "'Georgia', serif"
                : event.primary_font === 'Baskerville'
                ? "'Baskerville', serif"
                : event.primary_font === 'Times New Roman'
                ? "'Times New Roman', serif"
                : event.primary_font === 'Arial'
                ? "'Arial', sans-serif"
                : event.primary_font === 'Helvetica'
                ? "'Helvetica', sans-serif"
                : event.primary_font === 'Verdana'
                ? "'Verdana', sans-serif"
                : event.primary_font === 'Trebuchet MS'
                ? "'Trebuchet MS', sans-serif"
                : event.primary_font === 'Palatino'
                ? "'Palatino', serif"
                : event.primary_font === 'Garamond'
                ? "'Garamond', serif"
                : event.primary_font === 'Caslon'
                ? "'Caslon', serif"
                : event.primary_font === 'Amanda Black'
                ? "'Amanda Black', cursive"
                : "'Playfair Display', Georgia, serif"
            }}>
              Wedding Memories
            </h2>
            
            {getFilteredSubmissions().length === 0 ? (
              <div className="text-center py-8 sm:py-12">
                <Heart className="w-12 h-12 sm:w-16 sm:h-16 text-wedding-400 mx-auto mb-4" />
                <p className="text-wedding-600 text-base sm:text-lg">
                  No memories shared yet. Be the first to share your wishes!
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
                {getFilteredSubmissions().map((submission) => (
                  <div key={submission.id} className="card">
                    {submission.type === 'photo' && submission.content_url && (
                      <div 
                        onClick={() => handleImageClick(submission)}
                        className="cursor-pointer hover:opacity-90 transition-opacity"
                      >
                        <img 
                          src={submission.content_url} 
                          alt="Wedding photo"
                          className="w-full h-48 object-cover rounded-t-2xl"
                        />
                      </div>
                    )}
                    {submission.type === 'video' && submission.content_url && (
                      <div 
                        onClick={() => handleImageClick(submission)}
                        className="cursor-pointer hover:opacity-90 transition-opacity"
                      >
                        <video 
                          src={submission.content_url}
                          controls
                          className="w-full h-48 object-cover rounded-t-2xl"
                        />
                      </div>
                    )}
                    {submission.type === 'voice' && submission.content_url && (
                      <div className="p-4 bg-wedding-100 rounded-t-2xl">
                        <audio controls className="w-full">
                          <source src={submission.content_url} type="audio/mpeg" />
                          Your browser does not support the audio element.
                        </audio>
                      </div>
                    )}
                    <div className="p-4">
                      {submission.message_text && (
                        <p className="text-gray-700 mb-2">{submission.message_text}</p>
                      )}
                      {submission.guest_name && (
                        <p className="text-sm text-wedding-600">- {submission.guest_name}</p>
                      )}
                      <p className="text-xs text-wedding-400 mt-2">
                        {new Date(submission.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showUploadModal && (
        <UploadModal 
          eventId={event.id}
          moderationEnabled={settings?.moderation_enabled}
          manualApproval={settings?.manual_approval}
          autoApprovalDelay={settings?.auto_approval_delay || 5}
          onClose={() => setShowUploadModal(false)}
          onSuccess={() => {
            setShowUploadModal(false)
            fetchSubmissions()
          }}
        />
      )}
      
      {showMessageModal && (
        <MessageModal 
          eventId={event.id}
          moderationEnabled={settings?.moderation_enabled}
          manualApproval={settings?.manual_approval}
          autoApprovalDelay={settings?.auto_approval_delay || 5}
          onClose={() => setShowMessageModal(false)}
          onSuccess={() => {
            setShowMessageModal(false)
            fetchSubmissions()
          }}
        />
      )}
      
      {showVoiceModal && (
        <VoiceModal 
          eventId={event.id}
          moderationEnabled={settings?.moderation_enabled}
          manualApproval={settings?.manual_approval}
          autoApprovalDelay={settings?.auto_approval_delay || 5}
          onClose={() => setShowVoiceModal(false)}
          onSuccess={() => {
            setShowVoiceModal(false)
            fetchSubmissions()
          }}
        />
      )}

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
    </div>
  )
}

