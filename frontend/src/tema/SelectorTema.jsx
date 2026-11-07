import { Monitor, Moon, Sun } from 'lucide-react'
import { Boton } from '../ui/componentes.jsx'
import { PREFERENCIAS, useTema } from './tema.js'

const INFO = {
  sistema: { icono: Monitor, texto: 'como el sistema' },
  claro: { icono: Sun, texto: 'claro' },
  oscuro: { icono: Moon, texto: 'oscuro' },
}

/** Botón redondo que alterna el tema: sistema → claro → oscuro. */
export default function SelectorTema({ tamano }) {
  const { preferencia, elegir } = useTema()
  const siguiente = PREFERENCIAS[(PREFERENCIAS.indexOf(preferencia) + 1) % PREFERENCIAS.length]
  const actual = INFO[preferencia]
  return (
    <Boton
      variante="secundario"
      soloIcono
      tamano={tamano}
      icono={actual.icono}
      etiqueta={`Tema ${actual.texto}. Cambiar a ${INFO[siguiente].texto}`}
      title={`Tema ${actual.texto}`}
      onClick={() => elegir(siguiente)}
    />
  )
}
