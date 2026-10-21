'use client';
import { useEffect, useState } from 'react';
export function useOffline() {
  const [ready, setReady] = useState(false),
    [message, setMessage] = useState('Offline preparation has not completed.'),
    [registration, setRegistration] = useState(null),
    [install, setInstall] = useState(null),
    [update, setUpdate] = useState(false);
  async function verify(reg) {
    const active = reg.active;
    if (!active) return;
    const channel = new MessageChannel();
    const result = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), 10000);
      channel.port1.onmessage = (e) => {
        clearTimeout(timer);
        channel.port1.close();
        resolve(e.data.ready);
      };
      active.postMessage({ type: 'VERIFY' }, [channel.port2]);
    });
    setReady(!!result);
    setMessage(
      result
        ? 'Ready offline. Every core screen is stored on this device.'
        : 'Offline preparation incomplete. Connect to the internet and retry.',
    );
  }
  async function prepare() {
    if (!('serviceWorker' in navigator)) {
      setMessage(
        'This browser does not support offline preparation. Use HTTPS in a supported browser.',
      );
      return;
    }
    try {
      setMessage('Preparing all screens for offline use…');
      const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
      setRegistration(reg);
      setUpdate(!!reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'redundant')
            setMessage('Offline preparation failed. Connect and retry.');
          if (reg.waiting) setUpdate(true);
          if (reg.active) verify(reg);
        });
      });
      navigator.serviceWorker.ready.then((r) => verify(r));
      if (reg.active) await verify(reg);
    } catch (e) {
      setReady(false);
      setMessage(`Offline preparation incomplete: ${e.message}`);
    }
  }
  useEffect(() => {
    prepare();
    const prompt = (e) => {
      e.preventDefault();
      setInstall(e);
    };
    window.addEventListener('beforeinstallprompt', prompt);
    const changed = () => navigator.serviceWorker.getRegistration().then((r) => r && verify(r));
    navigator.serviceWorker?.addEventListener('controllerchange', changed);
    return () => {
      window.removeEventListener('beforeinstallprompt', prompt);
      navigator.serviceWorker?.removeEventListener('controllerchange', changed);
    };
  }, []);
  async function retry() {
    if (registration?.active) {
      const c = new MessageChannel();
      c.port1.onmessage = () => {
        c.port1.close();
        verify(registration);
      };
      registration.active.postMessage({ type: 'REPAIR' }, [c.port2]);
    } else await prepare();
  }
  return {
    ready,
    message,
    retry,
    update,
    install: install
      ? async () => {
          await install.prompt();
          await install.userChoice;
          setInstall(null);
        }
      : null,
    applyUpdate: async () => {
      registration?.waiting?.postMessage({ type: 'ACTIVATE' });
      navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {
        once: true,
      });
    },
  };
}
