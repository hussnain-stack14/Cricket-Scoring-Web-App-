'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    navigator.standalone === true ||
    document.referrer.startsWith('android-app://')
  );
}

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
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installState, setInstallState] = useState('checking');
  const [installed, setInstalled] = useState(false);
  const [update, setUpdate] = useState(false);
  const registrationRef = useRef(null);
  const precacheErrorRef = useRef(null);

  const verify = useCallback(async (reg) => {
    if (!reg?.active) {
      setReady(false);
      setMessage('Offline Preparation Failed: no active service worker is available.');
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
      setMessage(
        isReady
          ? 'Ready for Offline Use'
          : `Offline Preparation Failed: ${result?.missing ?? 'some'} required assets are not cached. Connect to the internet and retry.`,
      );
      return isReady;
    } catch (error) {
      channel.port1.close();
      setReady(false);
      setMessage(`Offline Preparation Failed: ${error.message} Connect to the internet and retry.`);
      return false;
    } finally {
      channel.port1.close();
    }
  }, []);

  const prepare = useCallback(async () => {
    setReady(false);
    if (process.env.NODE_ENV !== 'production') {
      setMessage(
        'Offline preparation is unavailable in the development server. Run the production build to prepare and verify offline assets.',
      );
      return false;
    }
    if (!window.isSecureContext) {
      setMessage('Offline Preparation Failed: use HTTPS or localhost in a supported browser.');
      return false;
    }
    if (!('serviceWorker' in navigator)) {
      setMessage('Offline Preparation Failed: this browser does not support service workers.');
      return false;
    }

    setMessage('Preparing Offline App…');
    precacheErrorRef.current = null;
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
      return await verify(reg);
    } catch (error) {
      setReady(false);
      setMessage(
        `Offline Preparation Failed: ${precacheErrorRef.current || error.message} Connect to the internet and retry.`,
      );
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
    const onInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
      setInstallState('available');
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setInstallState('installed');
    };
    const onWorkerMessage = (event) => {
      if (event.data?.type === 'PRECACHE_FAILED') {
        precacheErrorRef.current = event.data.message;
        setReady(false);
        setMessage(
          `Offline Preparation Failed: ${event.data.message} Connect to the internet and retry.`,
        );
      }
    };
    const media = window.matchMedia('(display-mode: standalone)');
    media.addEventListener?.('change', updateInstalledState);
    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    navigator.serviceWorker?.addEventListener('message', onWorkerMessage);
    updateInstalledState();
    const instructionTimer = setTimeout(() => {
      setInstallState((current) => (current === 'checking' ? 'instructions' : current));
    }, 1500);
    prepare();
    return () => {
      clearTimeout(instructionTimer);
      media.removeEventListener?.('change', updateInstalledState);
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
      navigator.serviceWorker?.removeEventListener('message', onWorkerMessage);
    };
  }, [prepare]);

  const install = useCallback(async () => {
    if (installed) return 'installed';
    if (!installPrompt) {
      setInstallState('instructions');
      return 'instructions';
    }
    const prompt = installPrompt;
    setInstallState('prompting');
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setInstallPrompt(null);
      if (choice?.outcome === 'accepted') {
        setInstallState((current) => (current === 'installed' ? current : 'accepted'));
        return 'accepted';
      }
      setInstallState((current) => (current === 'installed' ? current : 'instructions'));
      return 'dismissed';
    } catch (error) {
      setInstallPrompt(null);
      setInstallState('instructions');
      setMessage(`Installation prompt failed: ${error.message}`);
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
        setMessage(
          `Offline Preparation Failed: ${result?.message || 'required assets could not be cached.'} Connect to the internet and retry.`,
        );
        return false;
      }
      return verify(registrationRef.current);
    } catch (error) {
      setMessage(`Offline Preparation Failed: ${error.message} Connect to the internet and retry.`);
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
    update,
    installed,
    installState,
    installationMessage,
    install,
    applyUpdate,
  };
}
