import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-trove-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-trove-accent border-t-transparent" />
      </div>
    )
  }

  if (!user) return <Navigate to="/" replace />
  return <>{children}</>
}
