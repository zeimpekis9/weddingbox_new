'use client'

import { useState } from 'react'
import { X, Download, Share2, Eye, EyeOff } from 'lucide-react'

interface ImageViewerModalProps {
  isOpen: boolean
  onClose: () => void
  imageUrl: string
  alt?: string
  guestName?: string
  createdAt?: string
  type?: string
  onApprove?: (id: string, approved: boolean) => void
  onDelete?: (id: string) => void
  approved?: boolean
}

export default function ImageViewerModal({ 
  isOpen, 
  onClose, 
  imageUrl, 
  alt = 'Wedding photo',
  guestName,
  createdAt,
  type = 'photo',
  onApprove,
  onDelete,
  approved = false
}: ImageViewerModalProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Wedding Photo',
          text: `Photo by ${guestName || 'Guest'}`,
          url: imageUrl
        })
      } catch (error) {
        console.log('Share error:', error)
        // Fallback to copying to clipboard
        navigator.clipboard.writeText(imageUrl)
      }
    } else {
      navigator.clipboard.writeText(imageUrl)
    }
  }

  const handleDownload = () => {
    const link = document.createElement('a')
    link.href = imageUrl
    link.download = `wedding-photo-${Date.now()}.jpg`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-gray-700">
              {type === 'photo' ? 'Photo' : type === 'video' ? 'Video' : 'Audio'}
            </span>
            {guestName && (
              <span className="text-sm text-gray-500">
                by {guestName}
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleShare}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Share"
            >
              <Share2 className="w-5 h-5" />
            </button>
            <button
              onClick={handleDownload}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Download"
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Image Content */}
        <div className={`flex items-center justify-center ${isFullscreen ? 'h-full' : 'max-h-[70vh]'}`}>
          {type === 'photo' ? (
            <img
              src={imageUrl}
              alt={alt}
              className={`max-w-full max-h-full object-contain ${isFullscreen ? 'h-full' : 'rounded-lg'}`}
              onClick={() => setIsFullscreen(!isFullscreen)}
            />
          ) : type === 'video' ? (
            <video
              src={imageUrl}
              controls
              className={`max-w-full max-h-full object-contain ${isFullscreen ? 'h-full' : 'rounded-lg'}`}
            />
          ) : (
            <audio
              src={imageUrl}
              controls
              className="w-full"
            />
          )}
        </div>

        {/* Footer */}
        {createdAt && (
          <div className="p-4 border-t border-gray-200 text-center">
            <p className="text-sm text-gray-500">
              {new Date(createdAt).toLocaleDateString()} at {new Date(createdAt).toLocaleTimeString()}
            </p>
          </div>
        )}

        {/* Admin Actions */}
        {(onApprove || onDelete) && (
          <div className="p-4 border-t border-gray-200 flex justify-center space-x-4">
            {onApprove && (
              <button
                onClick={() => {
                  // Find submission ID by content URL (this is a simplified approach)
                  // In a real app, you'd pass the submission ID directly
                  console.log('Approve action - would need submission ID')
                }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  approved 
                    ? 'bg-green-100 text-green-800 hover:bg-green-200' 
                    : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                }`}
              >
                {approved ? 'Approved' : 'Approve'}
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => {
                  console.log('Delete action - would need submission ID')
                }}
                className="px-4 py-2 rounded-lg font-medium bg-red-100 text-red-800 hover:bg-red-200 transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
