'use client'

import { Palette } from 'lucide-react'

interface ColorSelectorProps {
  primaryColor: string
  secondaryColor: string
  accentColor: string
  onColorChange: (type: 'primary' | 'secondary' | 'accent', color: string) => void
}

export default function ColorSelector({ 
  primaryColor, 
  secondaryColor, 
  accentColor, 
  onColorChange 
}: ColorSelectorProps) {
  const presetColors = [
    '#a67c52', '#8b5a3c', '#704a3a', '#5a3d2e', // Browns
    '#ede1d1', '#e6d3bc', '#d4b896', '#c19a6b', // Light browns
    '#2c3e50', '#34495e', '#7f8c8d', '#95a5a6', // Grays
    '#c0392b', '#e74c3c', '#f39c12', '#f1c40f', // Warm colors
    '#27ae60', '#2ecc71', '#3498db', '#2980b9', // Cool colors
    '#8e44ad', '#9b59b6', '#e67e22', '#d35400', // Additional
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-2">
        <Palette className="w-4 h-4 mr-2" />
        <h3 className="text-md font-medium text-gray-800">Theme Colors</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Primary Color */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Primary Color</label>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => onColorChange('primary', e.target.value)}
                className="h-10 w-20 border border-gray-300 rounded cursor-pointer"
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => onColorChange('primary', e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div className="grid grid-cols-6 gap-1">
              {presetColors.map((color) => (
                <button
                  key={color}
                  onClick={() => onColorChange('primary', color)}
                  className="w-8 h-8 rounded border-2 border-gray-200 hover:border-gray-400 transition-colors"
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
          </div>
        </div>
        
        {/* Secondary Color */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Secondary Color</label>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <input
                type="color"
                value={secondaryColor}
                onChange={(e) => onColorChange('secondary', e.target.value)}
                className="h-10 w-20 border border-gray-300 rounded cursor-pointer"
              />
              <input
                type="text"
                value={secondaryColor}
                onChange={(e) => onColorChange('secondary', e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div className="grid grid-cols-6 gap-1">
              {presetColors.map((color) => (
                <button
                  key={color}
                  onClick={() => onColorChange('secondary', color)}
                  className="w-8 h-8 rounded border-2 border-gray-200 hover:border-gray-400 transition-colors"
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
          </div>
        </div>
        
        {/* Accent Color */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Accent Color</label>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <input
                type="color"
                value={accentColor}
                onChange={(e) => onColorChange('accent', e.target.value)}
                className="h-10 w-20 border border-gray-300 rounded cursor-pointer"
              />
              <input
                type="text"
                value={accentColor}
                onChange={(e) => onColorChange('accent', e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div className="grid grid-cols-6 gap-1">
              {presetColors.map((color) => (
                <button
                  key={color}
                  onClick={() => onColorChange('accent', color)}
                  className="w-8 h-8 rounded border-2 border-gray-200 hover:border-gray-400 transition-colors"
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Color Preview</h4>
        <div className="grid grid-cols-3 gap-4">
          <div 
            className="p-3 rounded text-center text-white text-sm font-medium"
            style={{ backgroundColor: primaryColor }}
          >
            Primary
          </div>
          <div 
            className="p-3 rounded text-center text-gray-800 text-sm font-medium"
            style={{ backgroundColor: secondaryColor }}
          >
            Secondary
          </div>
          <div 
            className="p-3 rounded text-center text-white text-sm font-medium"
            style={{ backgroundColor: accentColor }}
          >
            Accent
          </div>
        </div>
      </div>
    </div>
  )
}
