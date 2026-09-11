import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Studio from './pages/Studio';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Studio />} />
        <Route path="/studio" element={<Studio />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
