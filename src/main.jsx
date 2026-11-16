import './domGuard.js'; // must run before React touches the DOM
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import '@fontsource/orbitron/600.css';
import '@fontsource/orbitron/800.css';
import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';
import './index.css';

createRoot(document.getElementById('root')).render(<App />);
