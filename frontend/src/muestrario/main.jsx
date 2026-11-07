// Página de prueba del sistema visual (solo en desarrollo: no entra en el build de producción).
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../tema/tokens.css'
import Muestrario from './Muestrario.jsx'
import './muestrario.css'

createRoot(document.getElementById('raiz')).render(
  <StrictMode>
    <Muestrario />
  </StrictMode>,
)
