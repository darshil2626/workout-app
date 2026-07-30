import { NavLink } from 'react-router-dom'
import { IconChart, IconDumbbell, IconHistory, IconList, IconSettings } from './Icons'

const TABS = [
  { to: '/', label: 'Workout', Icon: IconDumbbell },
  { to: '/history', label: 'History', Icon: IconHistory },
  { to: '/stats', label: 'Stats', Icon: IconChart },
  { to: '/exercises', label: 'Exercises', Icon: IconList },
  { to: '/settings', label: 'Settings', Icon: IconSettings },
]

export function BottomNav() {
  return (
    <nav className="bottom-nav">
      {TABS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          <Icon />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
