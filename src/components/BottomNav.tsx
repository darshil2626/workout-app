import { NavLink } from 'react-router-dom'
import { IconChart, IconDumbbell, IconHistory } from './Icons'

// Home sits dead centre as the app's anchor; the exercise library and
// settings moved to header icons on the home screen instead of tabs.
const TABS = [
  { to: '/history', label: 'History', Icon: IconHistory },
  { to: '/', label: 'Home', Icon: IconDumbbell },
  { to: '/stats', label: 'Stats', Icon: IconChart },
]

export function BottomNav() {
  return (
    <nav className="bottom-nav">
      {TABS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          viewTransition
          // Tabs never lead to/from a fullscreen route, so the direction is
          // always a plain forward slide — no need for the full classifier
          // in lib/navigate.ts that Header/list-to-detail navigation uses.
          onClick={() => {
            document.documentElement.dataset.navDirection = 'forward'
          }}
          className={({ isActive }) =>
            `nav-item${to === '/' ? ' nav-item-home' : ''}${isActive ? ' active' : ''}`
          }
        >
          <Icon />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
