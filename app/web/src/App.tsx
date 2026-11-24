import { useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Header } from './components/Header';
import { RequireSession } from './components/RequireSession';
import { LogIn } from './pages/LogIn';
import { Register } from './pages/Register';
import { TripPage } from './pages/TripPage';
import { Trips, fetchTrips } from './pages/Trips';

// Routes for the F1 screens. Trip pages sit behind RequireSession (F1.R9).
// `loggedIn` is the app's own knowledge of the session: set by a successful
// login or a live trip request, cleared by a 401 or a log out.
export function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  return (
    <BrowserRouter>
      <main>
        <h1>Trip Expense Tracker</h1>
        <Header loggedIn={loggedIn} onLoggedOut={() => setLoggedIn(false)} />
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LogIn onLoggedIn={() => setLoggedIn(true)} />} />
          <Route path="/register" element={<Register onRegistered={() => setLoggedIn(true)} />} />
          <Route
            path="/trips"
            element={
              <RequireSession load={fetchTrips} onSessionChange={setLoggedIn}>
                <Trips />
              </RequireSession>
            }
          />
          <Route path="/trips/:id" element={<TripPage onSessionChange={setLoggedIn} />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
