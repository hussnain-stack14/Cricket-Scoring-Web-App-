'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { liveQuery } from 'dexie';
import { PWA_INSTALL_EVENT } from './PwaInstallCapture';
import { db } from '../lib/db';

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    navigator.standalone === true ||
    document.referrer.startsWith('android-app://')
  );
}

const offlineFailure = "Offline setup couldn't finish. Connect to the internet and try again.";
const UPDATE_SNOOZE_KEY = 'crease-update-snoozed-until';
const UPDATE_DISMISSED_KEY = 'crease-update-dismissed-session';
const UPDATE_SNOOZE_MS = 24 * 60 * 60 * 1000;
const UPDATE_TIMEOUT_MS = 30_000;
let updateReloadStarted = false;

function storedTimestamp() {
  try {
    const value = Number(localStorage.getItem(UPDATE_SNOOZE_KEY));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function dismissedForSession() {
  try {
    return sessionStorage.getItem(UPDATE_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function updateAvailablePhase() {
  return storedTimestamp() > Date.now() ? 'deferred' : 'available';
}

function verifyWorker(worker) {
  if (!worker) return Promise.reject(new Error('No waiting service worker is available.'));
  const channel = new MessageChannel();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      channel.port1.close();
      reject(new Error('Timed out verifying the waiting update.'));
    }, 15000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      if (event.data?.ready === true) resolve(true);
      else reject(new Error('The waiting update is not ready. Check your connection and retry.'));
      channel.port1.close();
    };
    channel.port1.onmessageerror = () => {
      clearTimeout(timer);
      channel.port1.close();
      reject(new Error('Could not verify the waiting update. Keep this page open and retry.'));
    };
    try {
      worker.postMessage({ type: 'VERIFY' }, [channel.port2]);
    } catch (error) {
      clearTimeout(timer);
      channel.port1.close();
      reject(error);
    }
  });
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
  const [installPrompt, setInstallPrompt] = useState(() =>
    typeof window === 'undefined' ? null : window.__creaseDeferredInstallPrompt || null,
  );
  const [installState, setInstallState] = useState('checking');
  const [installed, setInstalled] = useState(false);
  const [update, setUpdate] = useState(false);
  const [snoozedUntil, setSnoozedUntil] = useState(storedTimestamp);
  const [dismissed, setDismissed] = useState(dismissedForSession);
  const [noticeClock, setNoticeClock] = useState(Date.now);
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const [updateBlocked, setUpdateBlocked] = useState(false);
  const [updatePhase, setUpdatePhase] = useState('checking');
  const [updateCheckState, setUpdateCheckState] = useState('idle');
  const [updateCheckError, setUpdateCheckError] = useState('');
  const [liveMatchCount, setLiveMatchCount] = useState(0);
  const registrationRef = useRef(null);
  const checkTimerRef = useRef(null);
  const releaseVersionRef = useRef(null);
  const updateListenerRef = useRef(null);
  const installingListenerRef = useRef(null);
  const applyPromiseRef = useRef(null);
  const checkPromiseRef = useRef(null);
  const installPromiseRef = useRef(null);
  const noticeVisible = update && !dismissed && snoozedUntil <= noticeClock;

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      setNoticeClock(now);
      if (storedTimestamp() <= now)
        setUpdatePhase((current) => (current === 'deferred' ? 'available' : current));
    };
    const timer = window.setInterval(tick, 60_000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  useEffect(() => {
    const subscription = liveQuery(() =>
      db.matches.filter((match) => match.status === 'live').count(),
    ).subscribe({
      next: (count) => {
        setLiveMatchCount(count);
        if (count === 0) {
          setUpdateBlocked(false);
          setUpdatePhase((current) => (current === 'waiting-live' ? 'available' : current));
        }
      },
      error: () =>
        setUpdateError('Could not check for active matches. Keep scoring open and retry.'),
    });
    return () => subscription.unsubscribe();
  }, []);

  const readRelease = useCallback(async () => {
    if (!navigator.onLine) return null;
    const response = await fetch('/release.json', {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!response.ok) return null;
    const release = await response.json();
    return typeof release?.version === 'string' && release.version ? release : null;
  }, []);

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
        if (installingListenerRef.current?.worker !== worker) {
          if (installingListenerRef.current)
            installingListenerRef.current.worker.removeEventListener(
              'statechange',
              installingListenerRef.current.listener,
            );
          const onStateChange = () => {
            if (worker?.state === 'installed' && navigator.serviceWorker.controller) {
              setUpdate(true);
              setUpdatePhase(updateAvailablePhase());
            }
          };
          if (worker) {
            worker.addEventListener('statechange', onStateChange);
            installingListenerRef.current = { worker, listener: onStateChange };
          }
        }
        if (reg.waiting || worker?.state === 'installed') {
          setUpdate(true);
          setUpdatePhase(updateAvailablePhase());
        }
      };
      if (updateListenerRef.current?.registration !== reg) {
        updateListenerRef.current?.registration.removeEventListener(
          'updatefound',
          updateListenerRef.current.listener,
        );
        reg.addEventListener('updatefound', updateFound);
        updateListenerRef.current = { registration: reg, listener: updateFound };
      }
      if (reg.installing || reg.waiting) updateFound();
      registrationRef.current = reg;
      setUpdate(!!reg.waiting);
      setUpdatePhase(reg.waiting ? updateAvailablePhase() : 'no-update');
      // Read release metadata independently of Cache Storage. A failed/offline
      // request is not an update and never changes local scoring data.
      try {
        const release = await readRelease();
        if (release) releaseVersionRef.current = release.version;
      } catch {
        // Service-worker revalidation below remains the source of truth.
      }
      // A registration alone does not check Vercel for a new worker after launch.
      // updateViaCache:none ensures sw.js itself is always revalidated.
      await reg.update();
      return await verify(reg);
    } catch (error) {
      setReady(false);
      setMessage(offlineFailure);
      return false;
    }
  }, [readRelease, verify]);

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
      if (updateListenerRef.current) {
        updateListenerRef.current.registration.removeEventListener(
          'updatefound',
          updateListenerRef.current.listener,
        );
        updateListenerRef.current = null;
      }
      if (installingListenerRef.current) {
        installingListenerRef.current.worker.removeEventListener(
          'statechange',
          installingListenerRef.current.listener,
        );
        installingListenerRef.current = null;
      }
    };
  }, [prepare]);

  const checkForUpdate = useCallback(async () => {
    if (checkPromiseRef.current) return checkPromiseRef.current;
    setUpdateCheckState('checking');
    setUpdateCheckError('');
    setUpdatePhase('checking');
    const check = (async () => {
      try {
        const reg =
          registrationRef.current || (await navigator.serviceWorker?.getRegistration('/'));
        if (!navigator.onLine) throw new Error('Connect to the internet, then retry.');
        if (!reg) throw new Error('Offline preparation is not available in this browser.');
        registrationRef.current = reg;
        let release = null;
        try {
          release = await readRelease();
        } catch {
          // A waiting service worker remains authoritative if release metadata is unavailable.
        }
        const releaseChanged = Boolean(
          release && releaseVersionRef.current && release.version !== releaseVersionRef.current,
        );
        if (release) releaseVersionRef.current = release.version;
        await reg.update();
        let hasUpdate = Boolean(reg.waiting);
        if (
          !hasUpdate &&
          reg.installing &&
          (releaseChanged || reg.installing.state === 'installing')
        ) {
          hasUpdate = await new Promise((resolve, reject) => {
            const worker = reg.installing;
            const cleanup = () => {
              clearTimeout(timer);
              worker.removeEventListener('statechange', onStateChange);
            };
            const onStateChange = () => {
              if (reg.waiting) {
                cleanup();
                resolve(true);
              } else if (worker.state === 'installed' || worker.state === 'redundant') {
                cleanup();
                if (worker.state === 'redundant')
                  reject(
                    new Error(
                      'The update could not be installed. Check your connection and retry.',
                    ),
                  );
                else resolve(false);
              }
            };
            const timer = setTimeout(() => {
              cleanup();
              reject(new Error('The update check timed out. Check your connection and retry.'));
            }, 45_000);
            worker.addEventListener('statechange', onStateChange);
            onStateChange();
          });
        }
        setUpdate(hasUpdate);
        if (hasUpdate) {
          setUpdatePhase(updateAvailablePhase());
          setUpdateCheckState('available');
        } else {
          setUpdatePhase('no-update');
          setUpdateCheckState('current');
        }
        return hasUpdate;
      } catch (error) {
        setUpdateCheckError(
          error instanceof Error ? error.message : 'Could not check for updates. Please retry.',
        );
        setUpdateCheckState('error');
        return false;
      }
    })();
    checkPromiseRef.current = check;
    try {
      return await check;
    } finally {
      checkPromiseRef.current = null;
    }
  }, [readRelease]);

  const install = useCallback(async () => {
    if (installPromiseRef.current) return installPromiseRef.current;
    const installing = (async () => {
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
    })();
    installPromiseRef.current = installing;
    try {
      return await installing;
    } finally {
      installPromiseRef.current = null;
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
    if (applyPromiseRef.current) return applyPromiseRef.current;
    const applying = (async () => {
      setApplyingUpdate(true);
      setUpdateError('');
      setUpdateBlocked(false);
      setUpdatePhase('preparing');
      try {
        const reg =
          registrationRef.current || (await navigator.serviceWorker?.getRegistration('/'));
        if (!reg?.waiting) {
          setUpdatePhase('no-update');
          throw new Error(
            'The waiting update is no longer available. Check for updates and retry.',
          );
        }
        registrationRef.current = reg;
        const waitingWorker = reg.waiting;
        await verifyWorker(waitingWorker);

        if (!db.isOpen()) await db.open();
        const hasLiveMatches = await db.transaction('r', ...db.tables, async () =>
          db.matches.filter((match) => match.status === 'live').count(),
        );
        if (hasLiveMatches) {
          setUpdateBlocked(true);
          setUpdatePhase('waiting-live');
          return false;
        }
        if (updateReloadStarted)
          throw new Error('An update is already being applied in another request. Wait or retry.');

        setUpdatePhase('applying');
        await new Promise((resolve, reject) => {
          let settled = false;
          const finish = (error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
            if (error) reject(error);
            else resolve();
          };
          const onControllerChange = () => {
            if (updateReloadStarted) return;
            updateReloadStarted = true;
            setUpdatePhase('completed');
            finish();
            window.location.reload();
          };
          const timer = setTimeout(
            () =>
              finish(
                new Error(
                  'The update did not take control of this page. Your saved data is unchanged; check your connection and retry.',
                ),
              ),
            UPDATE_TIMEOUT_MS,
          );
          navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
          if (reg.waiting !== waitingWorker) {
            finish(
              new Error('The waiting update changed before it could be applied. Retry safely.'),
            );
            return;
          }
          try {
            waitingWorker.postMessage({ type: 'ACTIVATE' });
          } catch (error) {
            finish(error);
          }
        });
        return true;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Could not apply the update. Your saved data is unchanged; retry when ready.';
        setUpdateError(message);
        setUpdatePhase('failed');
        return false;
      } finally {
        setApplyingUpdate(false);
      }
    })();
    applyPromiseRef.current = applying;
    try {
      return await applying;
    } finally {
      applyPromiseRef.current = null;
    }
  }

  function deferUpdate() {
    const until = Date.now() + UPDATE_SNOOZE_MS;
    setSnoozedUntil(until);
    setNoticeClock(Date.now());
    setUpdatePhase('deferred');
    try {
      localStorage.setItem(UPDATE_SNOOZE_KEY, String(until));
    } catch {
      // Snoozing is optional; the update remains available if storage is blocked.
    }
  }

  function dismissUpdateNotice() {
    setDismissed(true);
    try {
      sessionStorage.setItem(UPDATE_DISMISSED_KEY, '1');
    } catch {
      // Closing the notice never changes the waiting service worker.
    }
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
    noticeVisible,
    updatePhase,
    applyingUpdate,
    updateError,
    updateBlocked,
    liveMatchCount,
    updateCheckState,
    updateCheckError,
    installed,
    installState,
    installationMessage,
    install,
    applyUpdate,
    deferUpdate,
    dismissUpdateNotice,
  };
}
