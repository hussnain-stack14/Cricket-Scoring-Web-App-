'use client';

import { useEffect } from 'react';

// `beforeinstallprompt` is a single-use browser event. Keep it at the application
// root so a route change (or a late-mounting install button) cannot lose it.
export const PWA_INSTALL_EVENT = 'crease:pwa-install-state';

function publishInstallState(state) {
  window.dispatchEvent(new CustomEvent(PWA_INSTALL_EVENT, { detail: { state } }));
}

export default function PwaInstallCapture() {
  useEffect(() => {
    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      window.__creaseDeferredInstallPrompt = event;
      publishInstallState('available');
    };
    const onAppInstalled = () => {
      window.__creaseDeferredInstallPrompt = null;
      publishInstallState('installed');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  return null;
}
