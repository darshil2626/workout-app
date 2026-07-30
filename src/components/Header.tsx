import { useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { IconBack } from './Icons'

interface HeaderProps {
  title: ReactNode
  /** Shows a back chevron; falls back to history.back() when no target given. */
  back?: string | true
  right?: ReactNode
  left?: ReactNode
}

export function Header({ title, back, right, left }: HeaderProps) {
  const navigate = useNavigate()
  return (
    <header className="header">
      <div className="header-row">
        {back && (
          <button
            className="icon-btn"
            aria-label="Back"
            onClick={() => (back === true ? navigate(-1) : navigate(back))}
          >
            <IconBack />
          </button>
        )}
        {left}
        <div className="header-title">{title}</div>
        {right}
      </div>
    </header>
  )
}
