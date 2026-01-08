'use client'

interface FontSelectorProps {
  selectedFont: string
  onFontChange: (font: string) => void
}

const fontOptions = [
  { value: 'Playfair Display', label: 'Playfair Display (Elegant Serif)', category: 'serif' },
  { value: 'Georgia', label: 'Georgia (Classic Serif)', category: 'serif' },
  { value: 'Times New Roman', label: 'Times New Roman (Traditional)', category: 'serif' },
  { value: 'Segoe UI', label: 'Segoe UI (Modern Sans)', category: 'sans-serif' },
  { value: 'Arial', label: 'Arial (Clean Sans)', category: 'sans-serif' },
  { value: 'Helvetica', label: 'Helvetica (Professional Sans)', category: 'sans-serif' },
  { value: 'Verdana', label: 'Verdana (Friendly Sans)', category: 'sans-serif' },
  { value: 'Courier New', label: 'Courier New (Monospace)', category: 'monospace' },
  { value: 'Garamond', label: 'Garamond (Classic Serif)', category: 'serif' },
  { value: 'Baskerville', label: 'Baskerville (Elegant Serif)', category: 'serif' },
  { value: 'Amanda Black', label: 'Amanda Black (Calligraphic)', category: 'cursive' }
]

export default function FontSelector({ selectedFont, onFontChange }: FontSelectorProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">Typography</label>
      <select
        value={selectedFont}
        onChange={(e) => onFontChange(e.target.value)}
        className="input-field w-full"
      >
        <option value="">Select a font...</option>
        {fontOptions.map((font) => (
          <option key={font.value} value={font.value}>
            {font.label}
          </option>
        ))}
      </select>
      
      {/* Font Preview */}
      {selectedFont && (
        <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <p 
            style={{ fontFamily: selectedFont }}
            className="text-lg text-gray-800"
          >
            The quick brown fox jumps over the lazy dog
          </p>
          <p 
            style={{ fontFamily: selectedFont }}
            className="text-sm text-gray-600 mt-2"
          >
            ABCDEFGHIJKLMNOPQRSTUVWXYZ
            abcdefghijklmnopqrstuvwxyz
            1234567890
          </p>
        </div>
      )}
    </div>
  )
}
