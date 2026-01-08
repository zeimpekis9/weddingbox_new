'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Mic, Square, Play, Pause } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface VoiceModalProps {
  eventId: string
  onClose: () => void
  onSuccess: () => void
  manualApproval?: boolean
  autoApprovalDelay?: number
}

export default function VoiceModal({ eventId, onClose, onSuccess, manualApproval = false, autoApprovalDelay = 5 }: VoiceModalProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [audioURL, setAudioURL] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [recordingTime, setRecordingTime] = useState(0)
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      if (audioURL) {
        URL.revokeObjectURL(audioURL)
      }
    }
  }, [audioURL])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data)
      }

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/mpeg' })
        const url = URL.createObjectURL(audioBlob)
        setAudioURL(url)
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)

    } catch (error) {
      console.error('Error accessing microphone:', error)
      alert('Unable to access microphone. Please check your permissions.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }

  const togglePlayback = () => {
    if (!audioRef.current) return

    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play()
      setIsPlaying(true)
    }
  }

  const handleSubmit = async () => {
    if (!audioURL) return

    setUploading(true)

    try {
      // Convert blob URL to blob
      const response = await fetch(audioURL)
      const audioBlob = await response.blob()
      
      const fileName = `voice-${Date.now()}.mp3`
      const filePath = `${eventId}/voices/${fileName}`

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('wedding-media')
        .upload(filePath, audioBlob)

      if (uploadError) throw uploadError

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('wedding-media')
        .getPublicUrl(filePath)

      // Save to database
      const { error: dbError } = await supabase
        .from('submissions')
        .insert({
          event_id: eventId,
          type: 'voice',
          content_url: publicUrl,
          guest_name: guestName.trim() || null,
          approved: false // Always start as unapproved
        })

      if (dbError) throw dbError

      // Handle auto-approval if manual approval is disabled
      if (!manualApproval) {
        setTimeout(async () => {
          try {
            await supabase
              .from('submissions')
              .update({ approved: true })
              .eq('event_id', eventId)
              .eq('content_url', publicUrl)
            
            console.log('Auto-approved voice after', autoApprovalDelay, 'seconds')
          } catch (error) {
            console.error('Auto-approval failed:', error)
          }
        }, autoApprovalDelay * 1000)
      }

      onSuccess()
      onClose()
    } catch (error) {
      console.error('Voice upload error:', error)
      alert('Failed to upload voice message. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Record a Voice Message</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Guest Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your Name (Optional)
              </label>
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="John & Jane Doe"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            {/* Recording Interface */}
            <div className="text-center py-6">
              {!audioURL ? (
                <div className="space-y-4">
                  {/* Recording Status */}
                  <div className="text-2xl font-mono text-gray-700">
                    {formatTime(recordingTime)}
                  </div>

                  {/* Recording Button */}
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center transition-colors ${
                      isRecording 
                        ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
                        : 'bg-primary-600 hover:bg-primary-700'
                    }`}
                  >
                    {isRecording ? (
                      <Square className="w-8 h-8 text-white" />
                    ) : (
                      <Mic className="w-8 h-8 text-white" />
                    )}
                  </button>

                  <p className="text-sm text-gray-600">
                    {isRecording ? 'Recording... Tap to stop' : 'Tap to start recording'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Audio Player */}
                  <audio
                    ref={audioRef}
                    src={audioURL}
                    onEnded={() => setIsPlaying(false)}
                    className="hidden"
                  />

                  {/* Playback Controls */}
                  <div className="flex justify-center items-center space-x-4">
                    <button
                      onClick={togglePlayback}
                      className="w-16 h-16 bg-primary-600 hover:bg-primary-700 rounded-full flex items-center justify-center text-white transition-colors"
                    >
                      {isPlaying ? (
                        <Pause className="w-6 h-6" />
                      ) : (
                        <Play className="w-6 h-6" />
                      )}
                    </button>
                  </div>

                  <p className="text-sm text-gray-600">Your voice message</p>

                  {/* Re-record Button */}
                  <button
                    onClick={() => {
                      setAudioURL(null)
                      setRecordingTime(0)
                      setIsPlaying(false)
                    }}
                    className="text-sm text-primary-600 hover:text-primary-700"
                  >
                    Record again
                  </button>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            {audioURL && (
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={uploading}
                  className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? 'Uploading...' : 'Send Voice Message'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
