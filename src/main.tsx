import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './styles/index.css'
import './core/compiler'
import { App } from './app/App'
import { getCurrentLocale, I18nProvider, setCurrentLocale } from './i18n'

setCurrentLocale(getCurrentLocale())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ReactFlowProvider>
        <App />
      </ReactFlowProvider>
    </I18nProvider>
  </StrictMode>,
)
