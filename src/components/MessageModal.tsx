'use client'

import { useState } from 'react'
import { X, MessageCircle, Send } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface MessageModalProps {
  eventId: string
  onClose: () => void
  onSuccess: () => void
  manualApproval?: boolean
  autoApprovalDelay?: number
}

export default function MessageModal({ eventId, onClose, onSuccess, manualApproval = false, autoApprovalDelay = 5 }: MessageModalProps) {
  const [message, setMessage] = useState('')
  const [guestName, setGuestName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!message.trim()) return

    setSubmitting(true)

    try {
      const { error } = await supabase
        .from('submissions')
        .insert({
          event_id: eventId,
          type: 'message',
          message_text: message.trim(),
          guest_name: guestName.trim() || null,
          approved: false // Always start as unapproved
        })

      if (error) throw error

      // Handle auto-approval if manual approval is disabled
      if (!manualApproval) {
        setTimeout(async () => {
          try {
            await supabase
              .from('submissions')
              .update({ approved: true })
              .eq('event_id', eventId)
              .eq('message_text', message.trim())
            
            console.log('Auto-approved message after', autoApprovalDelay, 'seconds')
          } catch (error) {
            console.error('Auto-approval failed:', error)
          }
        }, autoApprovalDelay * 1000)
      }

      onSuccess()
      onClose()
    } catch (error) {
      console.error('Message submission error:', error)
      alert('Failed to send message. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEmojiInsert = (emoji: string) => {
    setMessage(prev => prev + emoji)
  }

  const emojis = ['❤️', '🎉', '🥂', '💐', '🌹', '✨', '🎊', '💕', '👰', '🤵']

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Leave a Message</h2>
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

            {/* Message */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your Message *
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Share your wishes, memories, or congratulations..."
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              />
              <p className="text-xs text-gray-500 mt-1">
                {message.length}/500 characters
              </p>
            </div>

            {/* Emoji Picker */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Add an emoji</p>
              <div className="flex flex-wrap gap-2">
                {emojis.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleEmojiInsert(emoji)}
                    className="text-2xl hover:bg-gray-100 rounded p-1 transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!message.trim() || submitting}
                className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Send Message
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
