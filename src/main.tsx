import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import './styles/style.css';
import './styles/themes.css';
import './styles/playback-controls.css';
import './styles/recording-workspace.css';
import './styles/readability.css';
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
