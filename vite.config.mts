import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // <--- WICHTIG: Erzwingt relative Pfade für Electron
});