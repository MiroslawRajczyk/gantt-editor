import { useCallback } from 'react'

interface Props {
  onResize: (deltaX: number) => void
}

export function Divider({ onResize }: Props) {
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX

      const onMove = (ev: MouseEvent) => {
        onResize(ev.clientX - startX)
      }

      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [onResize],
  )

  return (
    <div
      className="divider"
      onMouseDown={handleMouseDown}
      aria-label="Resize panels"
    />
  )
}
