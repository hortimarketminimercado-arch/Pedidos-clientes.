import { Download, Share, Smartphone, WifiOff, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    install,
  };
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return isOnline;
}

export const PWAInstallButton: React.FC<{ variant?: 'primary' | 'subtle' }> = ({
  variant = 'primary',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) return null;

  const handleClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        className={
          variant === 'primary'
            ? 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#143624] text-white hover:bg-[#1F6E43] transition-colors whitespace-nowrap shrink-0 cursor-pointer'
            : 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white border border-[#D4DBD0] text-[#143624] hover:bg-[#EEF3EC] transition-colors whitespace-nowrap shrink-0 cursor-pointer'
        }
      >
        <Download className="w-3.5 h-3.5" />
        <span>Instalar App</span>
      </button>

      {showGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Instalar Hortimarket Delivery"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white border border-[#E4E8E0] p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-[#EEF3EC] text-[#143624]">
                  <Smartphone className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-display text-lg font-bold text-[#143624]">
                    Instalar Hortimarket App
                  </h3>
                  <p className="text-xs text-[#526057]">
                    Acesse o mercado e o encarte direto da sua tela inicial.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Fechar instruções"
                className="p-1.5 rounded-lg text-[#526057] hover:bg-[#EEF1EA] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="space-y-2.5 text-sm text-[#435048] bg-[#FAFBF8] border border-[#E4E8E0] rounded-xl p-4">
                <li className="flex items-start gap-2">
                  <span className="font-bold text-[#143624] tabular-nums">1.</span>
                  <span>
                    Toque no botão{' '}
                    <strong className="inline-flex items-center gap-1 text-[#143624]">
                      Compartilhar <Share className="w-3.5 h-3.5" />
                    </strong>{' '}
                    na barra do Safari.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-[#143624] tabular-nums">2.</span>
                  <span>
                    Role para baixo e selecione{' '}
                    <strong className="text-[#143624]">Adicionar à Tela de Início</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-[#143624] tabular-nums">3.</span>
                  <span>
                    Confirme em <strong className="text-[#143624]">Adicionar</strong> para abrir como
                    aplicativo.
                  </span>
                </li>
              </ol>
            ) : (
              <ol className="space-y-2.5 text-sm text-[#435048] bg-[#FAFBF8] border border-[#E4E8E0] rounded-xl p-4">
                <li className="flex items-start gap-2">
                  <span className="font-bold text-[#143624] tabular-nums">1.</span>
                  <span>
                    Abra este endereço diretamente no navegador (Chrome, Edge ou Android) fora de
                    janelas incorporadas.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-[#143624] tabular-nums">2.</span>
                  <span>
                    Toque no menu do navegador (<strong className="text-[#143624]">⋮</strong>) ou no
                    ícone de instalação na barra de endereços.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-[#143624] tabular-nums">3.</span>
                  <span>
                    Selecione <strong className="text-[#143624]">Instalar aplicativo</strong> ou{' '}
                    <strong className="text-[#143624]">Adicionar à tela inicial</strong>.
                  </span>
                </li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full py-2.5 rounded-xl text-xs font-semibold bg-[#143624] text-white hover:bg-[#1F6E43] transition-colors cursor-pointer"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-[#B45309] px-3.5 py-2 text-xs font-semibold text-white shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>Modo offline — exibindo catálogo em cache.</span>
    </div>
  );
};
