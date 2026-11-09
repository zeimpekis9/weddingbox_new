import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'

export default defineConfig([
  ...nextVitals,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
  {
    // Existing Supabase effects are replaced during the API migration.
    files: ['src/app/\\[slug\\]/page.tsx', 'src/app/admin/page.tsx'],
    rules: { 'react-hooks/immutability': 'warn' },
  },
  {
    files: ['src/app/admin/components/EditEventModal.tsx', 'src/components/VoiceModal.tsx'],
    rules: { 'react-hooks/set-state-in-effect': 'warn' },
  },
])
