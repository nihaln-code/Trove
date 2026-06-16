import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/auth'
import api from './services/api'
import Landing from './pages/Landing'
import Browse from './pages/Browse'
import Watchlist from './pages/Watchlist'
import Recommendations from './pages/Recommendations'
import Groups from './pages/Groups'
import GroupDetail from './pages/GroupDetail'
import Profile from './pages/Profile'
import Layout from './components/layout/Layout'
import ProtectedRoute from './components/auth/ProtectedRoute'

export default function App() {
  const { setUser, setLoading } = useAuthStore()

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      setLoading(false)
      return
    }
    api
      .get('/users/me')
      .then((res) => setUser(res.data))
      .catch(() => {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
      })
      .finally(() => setLoading(false))
  }, [setUser, setLoading])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/browse" element={<Browse />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/recommendations" element={<Recommendations />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="/groups/:groupId" element={<GroupDetail />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
