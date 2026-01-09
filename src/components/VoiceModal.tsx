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
  const [mobileError, setMobileError] = useState<string | null>(null)
  const [debugLogs, setDebugLogs] = useState<string[]>([])
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Helper to add debug logs
  const addDebugLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    const logMessage = `[${timestamp}] ${message}`
    console.log(logMessage)
    setDebugLogs(prev => [...prev.slice(-4), logMessage]) // Keep last 5 logs
  }

  // Check if MediaRecorder is supported
  const [isMediaRecorderSupported, setIsMediaRecorderSupported] = useState(false)

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

  // Check if MediaRecorder is supported on component mount
  useEffect(() => {
    addDebugLog('=== DEVICE DETECTION ===')
    addDebugLog(`User Agent: ${navigator.userAgent}`)
    addDebugLog(`Is iOS: ${/iPad|iPhone|iPod/.test(navigator.userAgent)}`)
    addDebugLog(`Is Safari: ${/Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)}`)
    
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)
    
    // Show iOS-specific warning
    if (isIOS && isSafari) {
      addDebugLog('iOS Safari detected - showing compatibility warning')
      setMobileError('⚠️ iOS Safari may have recording issues. Try using Chrome, Firefox, or the mobile app for best results.')
    }
    
    if (typeof MediaRecorder === 'undefined') {
      addDebugLog('MediaRecorder is undefined')
      setIsMediaRecorderSupported(false)
      setMobileError('Voice recording is not supported on this device. Please try on a desktop computer.')
      return
    }
    
    // iOS Safari has specific MediaRecorder limitations
    if (isIOS && isSafari) {
      addDebugLog('iOS Safari detected - checking MediaRecorder support...')
      // iOS Safari has limited MediaRecorder support
      const webmSupported = MediaRecorder.isTypeSupported('audio/webm')
      const mp4Supported = MediaRecorder.isTypeSupported('audio/mp4')
      
      addDebugLog(`iOS WebM supported: ${webmSupported}`)
      addDebugLog(`iOS MP4 supported: ${mp4Supported}`)
      
      if (!mp4Supported) {
        addDebugLog('iOS Safari does not support MediaRecorder properly')
        setIsMediaRecorderSupported(false)
        setMobileError('❌ Voice recording not supported on this iOS version. Please update iOS or use a different browser.')
        return
      }
    } else {
      // Check webm support but be more permissive for mobile
      const webmSupported = MediaRecorder.isTypeSupported('audio/webm')
      const mp4Supported = MediaRecorder.isTypeSupported('audio/mp4')
      addDebugLog(`WebM supported: ${webmSupported}`)
      addDebugLog(`MP4 supported: ${mp4Supported}`)
      
      if (!webmSupported && !mp4Supported) {
        addDebugLog('No audio formats supported')
        setIsMediaRecorderSupported(false)
        setMobileError('Voice recording is not supported on this device. Please try on a desktop computer.')
        return
      }
    }
    
    addDebugLog('MediaRecorder is supported')
    setIsMediaRecorderSupported(true)
  }, [])

  const startRecording = async () => {
    addDebugLog('=== START RECORDING DEBUG ===')
    addDebugLog(`User Agent: ${navigator.userAgent}`)
    addDebugLog(`isMediaRecorderSupported: ${isMediaRecorderSupported}`)
    addDebugLog(`Current isRecording state: ${isRecording}`)
    addDebugLog(`MediaRecorder available: ${typeof MediaRecorder !== 'undefined'}`)
    addDebugLog(`HTTPS protocol: ${window.location.protocol === 'https:'}`)
    addDebugLog(`Secure context: ${window.isSecureContext}`)
    
    // Reset any previous errors
    setMobileError(null)
    
    // Clear any existing timer
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    
    if (!isMediaRecorderSupported) {
      addDebugLog('MediaRecorder not supported')
      setMobileError('Voice recording is not supported on this device. Please try on a desktop computer.')
      return
    }
    
    // Check for secure context (required for getUserMedia)
    if (!window.isSecureContext) {
      addDebugLog('Not in secure context')
      setMobileError('Voice recording requires a secure connection (HTTPS). Please use https://')
      return
    }
    
    try {
      addDebugLog('Requesting microphone access...')
      
      // iOS-specific constraints
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
      const constraints = isIOS ? {
        audio: {
          echoCancellation: false, // iOS doesn't support this well
          noiseSuppression: false, // iOS doesn't support this well
          autoGainControl: false, // iOS doesn't support this well
          sampleRate: 44100
        },
        video: false
      } : {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        },
        video: false
      }
      
      addDebugLog(`Using constraints: ${JSON.stringify(constraints)}`)
      
      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia is not available on this device')
      }
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      addDebugLog('Microphone access granted')
      addDebugLog(`Stream active: ${stream.active}`)
      addDebugLog(`Audio tracks: ${stream.getAudioTracks().length}`)
      
      if (!stream.active || stream.getAudioTracks().length === 0) {
        throw new Error('Microphone stream is not active')
      }
      
      // Check if MediaRecorder is supported
      if (typeof MediaRecorder === 'undefined') {
        throw new Error('MediaRecorder is not supported on this device')
      }
      
      // iOS-specific format handling
      let mimeType = 'audio/webm'
      let fileExtension = 'webm'
      
      if (isIOS) {
        // iOS prefers MP4 format
        if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4'
          fileExtension = 'm4a'
        } else {
          addDebugLog('iOS does not support any audio format')
          throw new Error('iOS does not support audio recording in this browser')
        }
      } else {
        // Non-iOS devices
        if (!MediaRecorder.isTypeSupported('audio/webm')) {
          addDebugLog('WebM not supported, trying MP4...')
          if (MediaRecorder.isTypeSupported('audio/mp4')) {
            mimeType = 'audio/mp4'
            fileExtension = 'm4a'
          } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
            mimeType = 'audio/ogg'
            fileExtension = 'ogg'
          } else {
            addDebugLog('No specific format supported, using default')
            mimeType = ''
          }
        }
      }
      
      addDebugLog(`Using mimeType: ${mimeType || 'default'}`)
      
      // Create MediaRecorder with iOS-friendly options
      const options = mimeType ? { mimeType } : {}
      const mediaRecorder = new MediaRecorder(stream, options)
      
      addDebugLog('MediaRecorder created')
      addDebugLog(`MediaRecorder state: ${mediaRecorder.state}`)
      
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []
      
      mediaRecorder.ondataavailable = (event) => {
        console.log('Data available, blob size:', event.data.size)
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }
      
      mediaRecorder.onstop = async () => {
        console.log('Recording stopped, processing audio...')
        // Clear timer when recording stops
        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop())
        
        const audioBlob = new Blob(audioChunksRef.current, { 
          type: mimeType || 'audio/webm' 
        })
        console.log('Audio blob created, size:', audioBlob.size)
        
        if (audioBlob.size === 0) {
          throw new Error('Recording failed - no audio data captured')
        }
        
        const audioURL = URL.createObjectURL(audioBlob)
        setAudioURL(audioURL)
        setIsRecording(false)
        setRecordingTime(0)
        
        // Upload to Supabase
        const fileName = `voice-${Date.now()}.${fileExtension}`
        const filePath = `${eventId}/voices/${fileName}`
        
        try {
          console.log('Starting upload to:', filePath)
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
              approved: manualApproval ? false : true
            })
          
          if (dbError) throw dbError
          
          // Handle auto-approval if manual approval is disabled
          if (!manualApproval && autoApprovalDelay > 0) {
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
        } catch (error: any) {
          console.error('Upload error:', error)
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          setMobileError(`Upload failed: ${errorMessage}. Please try again.`)
        }
      }
      
      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event)
        setMobileError('Recording error occurred. Please try again.')
      }
      
      // Start recording with mobile-friendly timeslice
      const timeslice = navigator.userAgent.includes('Mobile') ? 1000 : undefined
      mediaRecorder.start(timeslice)
      console.log('Recording started with timeslice:', timeslice)
      setIsRecording(true)
      
      // Start timer (only once, with null check)
      if (!timerRef.current) {
        timerRef.current = setInterval(() => {
          setRecordingTime(prev => prev + 1)
        }, 1000)
      }
      
    } catch (error: any) {
      console.error('Recording error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      // Provide more specific error messages for mobile
      if (errorMessage.includes('Permission denied')) {
        setMobileError('Microphone permission denied. Please allow microphone access in your browser settings.')
      } else if (errorMessage.includes('not supported')) {
        setMobileError('Voice recording is not supported on this device/browser.')
      } else if (errorMessage.includes('secure')) {
        setMobileError('Voice recording requires a secure connection (HTTPS).')
      } else {
        setMobileError(`Recording failed: ${errorMessage}. Please try again.`)
      }
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      
      // Clear timer immediately
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
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
          approved: manualApproval ? false : true // If manual approval is off, auto-approve; otherwise start unapproved
        })

      if (dbError) throw dbError

      // Handle auto-approval if manual approval is disabled
      if (!manualApproval && autoApprovalDelay > 0) {
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

                  {/* Debug Info */}
                  <div className="text-xs text-gray-500 mb-2">
                    <div>Supported: {isMediaRecorderSupported ? 'Yes' : 'No'}</div>
                    <div>Recording: {isRecording ? 'Yes' : 'No'}</div>
                    <div>HTTPS: {window.location.protocol === 'https:' ? 'Yes' : 'No'}</div>
                  </div>

                  {/* Debug Logs */}
                  <div className="text-xs bg-gray-100 p-2 rounded mb-2 max-h-32 overflow-y-auto">
                    <div className="font-bold mb-1">Debug Logs:</div>
                    {debugLogs.map((log, index) => (
                      <div key={index} className="text-gray-700">{log}</div>
                    ))}
                  </div>

                  {/* Test Button */}
                  <button
                    type="button"
                    onClick={() => {
                      addDebugLog('=== SIMPLE TEST CLICK ===')
                      alert('Button click works!')
                    }}
                    className="mx-auto w-16 h-16 bg-blue-500 text-white rounded-full flex items-center justify-center mb-4"
                  >
                    TEST
                  </button>

                  {/* Recording Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      addDebugLog('=== BUTTON CLICK ===')
                      addDebugLog(`isRecording: ${isRecording}`)
                      if (isRecording) {
                        stopRecording()
                      } else {
                        startRecording()
                      }
                    }}
                    onTouchStart={(e) => {
                      e.preventDefault()
                      addDebugLog('=== TOUCH START ===')
                      addDebugLog(`isRecording: ${isRecording}`)
                      if (isRecording) {
                        stopRecording()
                      } else {
                        startRecording()
                      }
                    }}
                    onTouchEnd={(e) => {
                      e.preventDefault()
                      addDebugLog('=== TOUCH END ===')
                      addDebugLog(`isRecording: ${isRecording}`)
                      // Don't do anything on touch end to avoid double triggers
                    }}
                    className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center transition-colors ${
                      isRecording 
                        ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
                        : 'bg-primary-600 hover:bg-primary-700 active:bg-primary-800'
                    }`}
                    style={{ 
                      WebkitTapHighlightColor: 'transparent',
                      WebkitUserSelect: 'none',
                      userSelect: 'none',
                      touchAction: 'manipulation',
                      cursor: 'pointer',
                      WebkitAppearance: 'none',
                      appearance: 'none',
                      border: 'none',
                      outline: 'none'
                    }}
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
