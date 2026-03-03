// Custom drag-to-resize hook — no external library dependency
import { useState, useRef, useCallback } from 'react'

interface UseResizableOptions {
  initial: number   // initial size in px
  min: number       // min px
  max: number       // max px
  direction?: 'x' | 'y'  // default: 'x' (horizontal drag)
}

interface UseResizableReturn {
  size: number
  handleMouseDown: (e: React.MouseEvent) => void
}

export function useResizable({ initial, min, max, direction = 'x' }: UseResizableOptions): UseResizableReturn {
  const [size, setSize] = useState(initial)
  const startPos = useRef(0)
  const startSize = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    startPos.current  = direction === 'x' ? e.clientX : e.clientY
    startSize.current = size

    const onMove = (me: MouseEvent): void => {
      const pos = direction === 'x' ? me.clientX : me.clientY
      const delta = pos - startPos.current
      setSize(Math.max(min, Math.min(max, startSize.current + delta)))
    }

    const onUp = (): void => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor   = direction === 'x' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [size, min, max, direction])

  return { size, handleMouseDown }
}
