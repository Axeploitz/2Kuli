import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Home from './pages/Home'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import UpdatesAdmin from './pages/UpdatesAdmin'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/owner" element={<Login />} />
          <Route path="/owner/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/owner/dashboard/update" element={<ProtectedRoute><UpdatesAdmin /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
