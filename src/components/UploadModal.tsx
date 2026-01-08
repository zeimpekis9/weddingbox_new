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
      // Check file size (reduce to 5MB for mobile)
      const maxSize = 5 * 1024 * 1024 // 5MB for mobile
      if (selectedFile.size > maxSize) {
        alert(`File size must be less than 5MB. Selected file: ${(selectedFile.size / 1024 / 1024).toFixed(1)}MB`)
        return
      }

      // Check file type (be more permissive for mobile)
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
      if (!allowedTypes.includes(selectedFile.type) && !selectedFile.type.startsWith('image/') && !selectedFile.type.startsWith('video/')) {
        alert(`Unsupported file type: ${selectedFile.type}. Please select an image or video file.`)
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

      // Upload file to Supabase Storage with different methods
      console.log('Starting upload to:', filePath)
      console.log('File details:', {
        name: file.name,
        size: file.size,
        type: file.type
      })
      console.log('Auth session:', await supabase.auth.getSession())
      
      let uploadError = null
      let publicUrl = ''
      
      // Method 1: Try standard upload first
      const { error: standardError } = await supabase.storage
        .from('wedding-media')
        .upload(filePath, file)
      
      if (!standardError) {
        console.log('Standard upload successful')
        const { data } = supabase.storage
          .from('wedding-media')
          .getPublicUrl(filePath)
        publicUrl = data.publicUrl
      } else {
        console.log('Standard upload failed, trying alternative methods...')
        
        // Method 2: Try with different file path (avoid conflicts)
        const uniqueFilePath = `${eventId}/photos/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`
        console.log('Trying with unique path:', uniqueFilePath)
        
        const { error: uniqueError } = await supabase.storage
          .from('wedding-media')
          .upload(uniqueFilePath, file)
        
        if (!uniqueError) {
          console.log('Unique path upload successful')
          const { data } = supabase.storage
            .from('wedding-media')
            .getPublicUrl(uniqueFilePath)
          publicUrl = data.publicUrl
        } else {
          console.log('All storage methods failed, using base64 fallback...')
          
          // Method 3: Convert to base64 and store directly in database (fallback)
          const reader = new FileReader()
          const base64Promise = new Promise<string>((resolve, reject) => {
            reader.onload = () => {
              const result = reader.result as string
              resolve(result)
            }
            reader.onerror = reject
            reader.readAsDataURL(file)
          })
          
          const base64Data = await base64Promise
          publicUrl = base64Data
          console.log('Using base64 fallback, data length:', base64Data.length)
        }
      }

      if (uploadError) {
        console.error('Storage upload error:', uploadError)
        // Provide mobile-specific error messages
        let errorMessage = 'Unknown upload error'
        
        if (uploadError && typeof uploadError === 'object' && uploadError !== null && 'message' in uploadError) {
          errorMessage = String((uploadError as any).message)
        }
        
        if (errorMessage?.includes('policy')) {
          throw new Error('Upload permissions error. Please try again or contact support.')
        } else if (errorMessage?.includes('size')) {
          throw new Error('File too large. Please choose a smaller file.')
        } else {
          throw new Error(`Upload failed: ${errorMessage}`)
        }
      }
      
      console.log('Upload successful, getting public URL...')

      // Get public URL (already have it from upload)
      // const { data: { publicUrl } } = supabase.storage
      //   .from('wedding-media')
      //   .getPublicUrl(filePath)

      // Determine file type
      const fileType = file.type.startsWith('image/') ? 'photo' : 'video'

      // Save submission to database
      console.log('Saving to database...')
      const { error: dbError } = await supabase
        .from('submissions')
        .insert({
          event_id: eventId,
          type: fileType,
          content_url: publicUrl,
          guest_name: guestName || null,
          approved: manualApproval ? false : true // If manual approval is off, auto-approve; otherwise start unapproved
        })

      if (dbError) {
        console.error('Database insert error:', dbError)
        throw dbError
      }
      
      console.log('Database save successful')

      // Handle delayed auto-approval if manual approval is disabled
      // Only run this if we want delayed approval instead of immediate approval
      if (!manualApproval && autoApprovalDelay > 0) {
        console.log(`Setting up delayed auto-approval in ${autoApprovalDelay} seconds...`)
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
      
      // Provide mobile-friendly error messages
      let errorMessage = 'Upload failed. Please try again.'
      
      if (error.message) {
        if (error.message.includes('network') || error.message.includes('connection')) {
          errorMessage = 'Network error. Please check your connection and try again.'
        } else if (error.message.includes('policy')) {
          errorMessage = 'Permission denied. The upload feature may be temporarily unavailable.'
        } else if (error.message.includes('size')) {
          errorMessage = 'File too large. Please choose a smaller photo (under 5MB).'
        } else {
          errorMessage = `Upload failed: ${error.message}`
        }
      } else if (error.status) {
        errorMessage = `Upload failed: Server error (${error.status}). Please try again.`
      }
      
      alert(errorMessage)
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
                  <p className="text-sm text-wedding-400">Max file size: 5MB (mobile optimized)</p>
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
