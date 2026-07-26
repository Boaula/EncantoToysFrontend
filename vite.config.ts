import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

// O Vite usa ES Modules por padrão, então recriamos o __dirname de forma segura assim:
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    // Adicionamos `: string` aqui para acalmar o TypeScript:
    resolveId(id: string) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // Os plugins React e Tailwind são necessários para o Make
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Aponta o @ para a pasta src
      '@': path.resolve(__dirname, './src'),
    },
  },

  // Suporte para importação de arquivos brutos
  assetsInclude: ['**/*.svg', '**/*.csv'],

  // --- CONFIGURAÇÕES DO TAURI ---
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: true,
  },
})