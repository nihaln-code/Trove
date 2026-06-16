import { useState, useEffect } from 'react'
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/auth'

const navItems = [
  { to: '/browse', label: 'Browse' },
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/recommendations', label: 'For You' },
  { to: '/groups', label: 'Groups' },
]

export default function Navbar() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [avatarError, setAvatarError] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => { setMenuOpen(false) }, [location.pathname])

  function handleLogout() {
    logout()
    navigate('/')
  }

  const Avatar = () =>
    user?.avatar_url && !avatarError ? (
      <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full">
        <img
          src={user.avatar_url}
          alt={user.name}
          className="h-full w-full object-cover"
          onError={() => setAvatarError(true)}
        />
      </div>
    ) : (
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-trove-accent text-sm font-semibold text-white">
        {user?.name?.[0]?.toUpperCase()}
      </div>
    )

  return (
    <nav className="sticky top-0 z-50 border-b border-trove-border/60 bg-trove-bg/95 shadow-lg shadow-black/20 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/browse" className="font-display text-2xl italic text-trove-accent">
          Trove
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-6 sm:flex">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `border-b pb-px text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-trove-accent text-trove-text'
                    : 'border-transparent text-trove-muted hover:text-trove-text'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>

        {/* Desktop user */}
        <div className="hidden items-center gap-3 sm:flex">
          <Link
            to="/profile"
            className="flex cursor-pointer items-center gap-2 rounded-full transition-opacity hover:opacity-80"
          >
            <Avatar />
            <span className="hidden text-sm font-medium text-trove-text sm:block">{user?.name}</span>
          </Link>
          <button
            onClick={handleLogout}
            className="cursor-pointer text-sm text-trove-muted transition-colors hover:text-trove-text"
          >
            Sign out
          </button>
        </div>

        {/* Mobile: avatar + hamburger */}
        <div className="flex items-center gap-3 sm:hidden">
          <Link to="/profile" className="transition-opacity hover:opacity-80">
            <Avatar />
          </Link>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-trove-muted transition-colors hover:text-trove-text"
            aria-label="Menu"
          >
            {menuOpen ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="border-t border-trove-border bg-trove-surface px-4 py-2 sm:hidden">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center py-3 text-base font-medium transition-colors ${
                  isActive ? 'text-trove-accent' : 'text-trove-muted'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
          <div className="my-2 border-t border-trove-border" />
          <button
            onClick={handleLogout}
            className="flex w-full cursor-pointer items-center py-3 text-base font-medium text-trove-muted transition-colors hover:text-trove-text"
          >
            Sign out
          </button>
        </div>
      )}
    </nav>
  )
}
