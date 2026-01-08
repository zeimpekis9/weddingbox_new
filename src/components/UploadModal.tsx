'use client'

import { useState, useRef } from 'react'
import { X, Upload, Camera, Video } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface UploadModalProps {
  eventId: string
  onClose: () => void
  onSuccess: () => void
  moderationEnabled?: boolean
  manualApproval?: boolean
  autoApprovalDelay?: number
}

export default function UploadModal({ eventId, onClose, onSuccess, moderationEnabled = false, manualApproval = false, autoApprovalDelay = 5 }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [guestName, setGuestName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      // Check file size (max 10MB)
      if (selectedFile.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB')
        return
      }

      // Check file type
      if (!selectedFile.type.startsWith('image/') && !selectedFile.type.startsWith('video/')) {
        alert('Please select an image or video file')
        return
      }

      setFile(selectedFile)
      
      // Create preview
      const reader = new FileReader()
      reader.onload = (e) => {
        setPreview(e.target?.result as string)
      }
      reader.readAsDataURL(selectedFile)
    }
  }

  const handleUpload = async () => {
    if (!file) return

    setUploading(true)

    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}.${fileExt}`
      const filePath = `${eventId}/photos/${fileName}`

      // Upload file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('wedding-media')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('wedding-media')
        .getPublicUrl(filePath)

      // Determine file type
      const fileType = file.type.startsWith('image/') ? 'photo' : 'video'

      // Save submission to database
      const { error: dbError } = await supabase
        .from('submissions')
        .insert({
          event_id: eventId,
          type: fileType,
          content_url: publicUrl,
          guest_name: guestName || null,
          approved: manualApproval ? false : true // If manual approval is off, auto-approve; otherwise start unapproved
        })

      if (dbError) throw dbError

      // Handle auto-approval if manual approval is disabled
      if (!manualApproval && !manualApproval) {
        setTimeout(async () => {
          try {
            await supabase
              .from('submissions')
              .update({ approved: true })
              .eq('event_id', eventId)
              .eq('content_url', publicUrl)
            
            console.log('Auto-approved photo/video after', autoApprovalDelay, 'seconds')
          } catch (error) {
            console.error('Auto-approval failed:', error)
          }
        }, autoApprovalDelay * 1000)
      }

      onSuccess()
      onClose()
    } catch (error: any) {
      console.error('Upload error:', error)
      setUploading(false)
      
      // Provide more specific error information
      if (error.message) {
        alert(`Upload failed: ${error.message}`)
      } else if (error.status) {
        alert(`Upload failed: HTTP ${error.status} - ${error.statusText || 'Unknown error'}`)
      } else {
        alert('Upload failed: Please check your internet connection and try again.')
      }
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Share a Memory</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="space-y-4">
            {/* File Upload Area */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-wedding-300 rounded-2xl p-8 text-center cursor-pointer hover:border-wedding-500 transition-colors bg-wedding-50"
            >
              {preview ? (
                <div className="space-y-2">
                  {file?.type.startsWith('image/') ? (
                    <img src={preview} alt="Preview" className="max-w-full h-48 mx-auto object-cover rounded-xl" />
                  ) : (
                    <video src={preview} className="max-w-full h-48 mx-auto object-cover rounded-xl" controls />
                  )}
                  <p className="text-sm text-wedding-600">{file?.name}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="w-12 h-12 text-wedding-400 mx-auto" />
                  <p className="text-wedding-600">Click to upload a photo or video</p>
                  <p className="text-sm text-wedding-400">Max file size: 10MB</p>
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Guest Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your Name (Optional)
              </label>
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="John & Jane Doe"
                className="input-field w-full"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-3 text-wedding-600 border border-wedding-600 rounded-xl hover:bg-wedding-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!file || uploading}
                className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? 'Uploading...' : 'Share Memory'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
