import { useCallback } from 'react'

interface Props {
  onResize: (deltaX: number) => void
}

export function Divider({ onResize }: Props) {
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      let lastX = e.clientX

      const onMove = (ev: MouseEvent) => {
        onResize(ev.clientX - lastX)
        lastX = ev.clientX
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
