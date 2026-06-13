import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth'

const navItems = [
  { to: '/browse', label: 'Browse' },
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/recommendations', label: 'For You' },
]

export default function Navbar() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [avatarError, setAvatarError] = useState(false)

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-trove-border/60 bg-trove-bg/95 shadow-lg shadow-black/20 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/browse" className="font-display text-2xl italic text-trove-accent">
          Trove
        </Link>

        <div className="flex items-center gap-6">
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

        <div className="flex items-center gap-3">
          <Link
            to="/profile"
            className="flex cursor-pointer items-center gap-2 rounded-full transition-opacity hover:opacity-80"
          >
            {user?.avatar_url && !avatarError ? (
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
            )}
            <span className="hidden text-sm font-medium text-trove-text sm:block">{user?.name}</span>
          </Link>
          <button
            onClick={handleLogout}
            className="cursor-pointer text-sm text-trove-muted transition-colors hover:text-trove-text"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  )
}
