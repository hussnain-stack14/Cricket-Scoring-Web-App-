'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PWA_INSTALL_EVENT } from './PwaInstallCapture';

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    navigator.standalone === true ||
    document.referrer.startsWith('android-app://')
  );
}

const offlineFailure = "Offline setup couldn't finish. Connect to the internet and try again.";

function waitForActivation(registration) {
  if (registration.active) return Promise.resolve(registration);
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      registration.removeEventListener('updatefound', check);
      registration.installing?.removeEventListener('statechange', check);
    };
    const check = () => {
      if (registration.active) {
        cleanup();
        resolve(registration);
      } else if (registration.installing?.state === 'redundant') {
        cleanup();
        reject(
          new Error(
            'The service worker could not install. Check that /sw.js and its cached assets load successfully.',
          ),
        );
      } else {
        registration.installing?.addEventListener('statechange', check);
      }
    };
    timer = setTimeout(() => {
      cleanup();
      reject(
        new Error('Timed out while preparing offline resources. Check your connection and retry.'),
      );
    }, 45000);
    registration.addEventListener('updatefound', check);
    check();
  });
}

export function useOffline() {
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('Checking offline preparation…');
  const [installPrompt, setInstallPrompt] = useState(() =>
    typeof window === 'undefined' ? null : window.__creaseDeferredInstallPrompt || null,
  );
  const [installState, setInstallState] = useState('checking');
  const [installed, setInstalled] = useState(false);
  const [update, setUpdate] = useState(false);
  const registrationRef = useRef(null);
  const checkTimerRef = useRef(null);

  const verify = useCallback(async (reg) => {
    if (!reg?.active) {
      setReady(false);
      setMessage(offlineFailure);
      return false;
    }
    const channel = new MessageChannel();
    try {
      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Timed out verifying cached application assets.')),
          15000,
        );
        channel.port1.onmessage = (event) => {
          clearTimeout(timer);
          resolve(event.data);
        };
        channel.port1.onmessageerror = () => {
          clearTimeout(timer);
          reject(new Error('Could not verify cached application assets.'));
        };
        reg.active.postMessage({ type: 'VERIFY' }, [channel.port2]);
      });
      const isReady = result?.ready === true;
      setReady(isReady);
      setMessage(isReady ? 'Ready to use offline.' : offlineFailure);
      return isReady;
    } catch (error) {
      channel.port1.close();
      setReady(false);
      setMessage(offlineFailure);
      return false;
    } finally {
      channel.port1.close();
    }
  }, []);

  const prepare = useCallback(async () => {
    setReady(false);
    if (process.env.NODE_ENV !== 'production') {
      setMessage('Offline setup is available in the installed app or production site.');
      return false;
    }
    if (!window.isSecureContext) {
      setMessage('Offline setup needs a secure connection. Open Crease using HTTPS.');
      return false;
    }
    if (!('serviceWorker' in navigator)) {
      setMessage('Offline use is not supported by this browser.');
      return false;
    }

    setMessage('Preparing Offline App…');
    try {
      let reg = await navigator.serviceWorker.getRegistration('/');
      if (!reg?.active) {
        reg = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        });
        reg = await Promise.race([navigator.serviceWorker.ready, waitForActivation(reg)]);
      }
      const updateFound = () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) setUpdate(true);
        });
        if (reg.waiting) setUpdate(true);
      };
      reg.addEventListener('updatefound', updateFound);
      if (reg.installing || reg.waiting) updateFound();
      registrationRef.current = reg;
      setUpdate(!!reg.waiting);
      // A registration alone does not check Vercel for a new worker after launch.
      // updateViaCache:none ensures sw.js itself is always revalidated.
      await reg.update();
      return await verify(reg);
    } catch (error) {
      setReady(false);
      setMessage(offlineFailure);
      return false;
    }
  }, [verify]);

  useEffect(() => {
    const updateInstalledState = () => {
      if (isStandalone()) {
        setInstalled(true);
        setInstallState('installed');
      }
    };
    const onInstallState = (event) => {
      const state = event.detail?.state;
      if (state === 'available') {
        setInstallPrompt(window.__creaseDeferredInstallPrompt || null);
        setInstallState('available');
      }
      if (state === 'installed') {
        setInstalled(true);
        setInstallPrompt(null);
        setInstallState('installed');
      }
    };
    const onWorkerMessage = (event) => {
      if (event.data?.type === 'PRECACHE_FAILED') {
        setReady(false);
        setMessage(offlineFailure);
      }
    };
    const media = window.matchMedia('(display-mode: standalone)');
    media.addEventListener?.('change', updateInstalledState);
    window.addEventListener(PWA_INSTALL_EVENT, onInstallState);
    navigator.serviceWorker?.addEventListener('message', onWorkerMessage);
    const check = () => {
      if (navigator.onLine && document.visibilityState === 'visible') void checkForUpdate();
    };
    window.addEventListener('online', check);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    checkTimerRef.current = window.setInterval(check, 30 * 60 * 1000);
    updateInstalledState();
    const instructionTimer = setTimeout(() => {
      setInstallState((current) => (current === 'checking' ? 'instructions' : current));
    }, 1500);
    prepare();
    return () => {
      clearTimeout(instructionTimer);
      media.removeEventListener?.('change', updateInstalledState);
      window.removeEventListener(PWA_INSTALL_EVENT, onInstallState);
      navigator.serviceWorker?.removeEventListener('message', onWorkerMessage);
      window.removeEventListener('online', check);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
      window.clearInterval(checkTimerRef.current);
    };
  }, [prepare]);

  const checkForUpdate = useCallback(async () => {
    const reg = registrationRef.current || (await navigator.serviceWorker?.getRegistration('/'));
    if (!reg || !navigator.onLine) return false;
    registrationRef.current = reg;
    try {
      await reg.update();
      setUpdate(Boolean(reg.waiting));
      return Boolean(reg.waiting);
    } catch {
      return false;
    }
  }, []);

  const install = useCallback(async () => {
    if (installed) return 'installed';
    const prompt = installPrompt || window.__creaseDeferredInstallPrompt;
    if (!prompt) {
      setInstallState('instructions');
      return 'instructions';
    }
    setInstallState('prompting');
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setInstallPrompt(null);
      window.__creaseDeferredInstallPrompt = null;
      if (choice?.outcome === 'accepted') {
        setInstallState((current) => (current === 'installed' ? current : 'accepted'));
        return 'accepted';
      }
      setInstallState((current) => (current === 'installed' ? current : 'instructions'));
      return 'dismissed';
    } catch (error) {
      setInstallPrompt(null);
      window.__creaseDeferredInstallPrompt = null;
      setInstallState('instructions');
      setMessage('Could not open the install prompt. Use your browser menu to install Crease.');
      return 'error';
    }
  }, [installed, installPrompt]);

  const retry = useCallback(async () => {
    const active = registrationRef.current?.active;
    if (!active) return prepare();
    setReady(false);
    setMessage('Preparing Offline App…');
    const channel = new MessageChannel();
    try {
      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Timed out repairing offline assets.')),
          45000,
        );
        channel.port1.onmessage = (event) => {
          clearTimeout(timer);
          resolve(event.data);
        };
        active.postMessage({ type: 'REPAIR' }, [channel.port2]);
      });
      if (!result?.ready) {
        setMessage(offlineFailure);
        return false;
      }
      return verify(registrationRef.current);
    } catch (error) {
      setMessage(offlineFailure);
      return false;
    } finally {
      channel.port1.close();
    }
  }, [prepare, verify]);

  async function applyUpdate() {
    const reg = registrationRef.current;
    if (!reg?.waiting) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {
      once: true,
    });
    reg.waiting.postMessage({ type: 'ACTIVATE' });
  }

  function deferUpdate() {
    // Keep the waiting worker intact; the next explicit check or app launch can offer it again.
    setUpdate(false);
  }

  const installationMessage = {
    checking: 'Checking installation support…',
    available: 'Install Crease',
    instructions: 'Installation instructions available',
    prompting: 'Opening installation prompt…',
    accepted: 'Installation accepted; waiting for browser confirmation.',
    error: 'Installation prompt unavailable; use the installation instructions.',
    installed: 'App Already Installed',
  }[installState];

  return {
    ready,
    message,
    retry,
    checkForUpdate,
    update,
    installed,
    installState,
    installationMessage,
    install,
    applyUpdate,
    deferUpdate,
  };
}
