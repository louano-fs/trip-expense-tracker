import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LogIn } from './pages/LogIn';
import { Register } from './pages/Register';
import { Trips } from './pages/Trips';

// Routes for the F1 screens. Trip pages are guarded in F1.T12.
export function App() {
  return (
    <BrowserRouter>
      <main>
        <h1>Trip Expense Tracker</h1>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LogIn />} />
          <Route path="/register" element={<Register />} />
          <Route path="/trips" element={<Trips />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
