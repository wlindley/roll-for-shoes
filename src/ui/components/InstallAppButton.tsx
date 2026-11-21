import type React from 'react';
import { useEffect, useRef, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly userChoice: Promise<{ readonly outcome: 'accepted' | 'dismissed'; readonly platform: string }>;
  prompt(): Promise<void>;
}

const supportsWebInstall =
  typeof Navigator !== 'undefined' &&
  typeof (Navigator.prototype as unknown as { install?: unknown }).install === 'function';

const getStandaloneMatches = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(display-mode: standalone)').matches
    : false;

const isAbortError = (err: unknown): boolean =>
  (err instanceof DOMException && err.name === 'AbortError') ||
  (typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError');

export function InstallAppButton(): React.JSX.Element {
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(getStandaloneMatches);
  const [webInstallAvailable, setWebInstallAvailable] = useState(supportsWebInstall);
  const [hasPrompt, setHasPrompt] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const mediaQuery =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)')
        : null;
    const handleDisplayModeChange = (event: MediaQueryListEvent) => setIsStandalone(event.matches);
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      deferredPromptRef.current = event as BeforeInstallPromptEvent;
      setHasPrompt(true);
    };
    const handleAppInstalled = () => {
      deferredPromptRef.current = null;
      setHasPrompt(false);
      setWebInstallAvailable(false);
      setStatus('App installed.');
    };

    if (mediaQuery) {
      setIsStandalone(mediaQuery.matches);
      mediaQuery.addEventListener('change', handleDisplayModeChange);
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      mediaQuery?.removeEventListener('change', handleDisplayModeChange);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const canShow = !isStandalone && (webInstallAvailable || hasPrompt);

  const handleInstallClick = async (): Promise<void> => {
    if (installing || !canShow) return;
    setInstalling(true);
    try {
      if (supportsWebInstall && webInstallAvailable) {
        await (navigator as unknown as { install: () => Promise<void> }).install();
        deferredPromptRef.current = null;
        setHasPrompt(false);
        setWebInstallAvailable(false);
        setStatus('The app was installed or opened.');
      } else if (deferredPromptRef.current) {
        const promptEvent = deferredPromptRef.current;
        deferredPromptRef.current = null;
        setHasPrompt(false);
        await promptEvent.prompt();
        const { outcome } = await promptEvent.userChoice;
        setStatus(outcome === 'accepted' ? 'App installation accepted.' : 'Installation dismissed.');
        setHasPrompt(Boolean(deferredPromptRef.current));
      }
    } catch (err: unknown) {
      if (isAbortError(err)) {
        setStatus('Installation was canceled or could not complete.');
      } else {
        setStatus('Installation could not start.');
        console.error(err);
      }
    } finally {
      setInstalling(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        hidden={!canShow}
        aria-disabled={installing ? 'true' : undefined}
        onClick={handleInstallClick}
      >
        Install App
      </button>
      {status && <span role="status" className="muted">{status}</span>}
    </>
  );
}
