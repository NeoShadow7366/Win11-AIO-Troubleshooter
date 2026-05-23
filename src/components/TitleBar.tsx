import { useEffect, useState, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Shield, Minus, Square, Copy, X } from "lucide-react";

export default function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const appWindow = getCurrentWindow();

  const syncMaximized = useCallback(async () => {
    try {
      setIsMaximized(await appWindow.isMaximized());
    } catch {
      /* ignore in dev */
    }
  }, [appWindow]);

  useEffect(() => {
    syncMaximized();
    const unlisten = appWindow.onResized(() => {
      syncMaximized();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [appWindow, syncMaximized]);

  return (
    <header
      id="titlebar"
      data-tauri-drag-region
      className="flex items-center justify-between h-[36px] min-h-[36px] select-none
                 bg-black/50 backdrop-blur-xl border-b border-white/[0.06] z-50"
    >
      {/* Left: Branding */}
      <div data-tauri-drag-region className="flex items-center gap-2.5 pl-3.5">
        <div className="relative flex items-center justify-center w-5 h-5">
          <Shield className="w-[18px] h-[18px] text-accent animate-pulse-glow" strokeWidth={2.2} />
          <div className="absolute inset-0 bg-accent/10 rounded-full blur-md" />
        </div>
        <span
          data-tauri-drag-region
          className="text-[12.5px] font-semibold tracking-[0.02em] text-white/90"
        >
          AIO Troubleshooter
        </span>
      </div>

      {/* Right: Window Controls */}
      <div className="flex items-center h-full">
        <button
          id="titlebar-minimize"
          onClick={() => appWindow.minimize()}
          className="inline-flex items-center justify-center w-[46px] h-full
                     text-white/60 hover:bg-white/[0.06] hover:text-white/90
                     transition-colors duration-150"
          aria-label="Minimize"
        >
          <Minus className="w-3.5 h-3.5" strokeWidth={2} />
        </button>

        <button
          id="titlebar-maximize"
          onClick={() => appWindow.toggleMaximize()}
          className="inline-flex items-center justify-center w-[46px] h-full
                     text-white/60 hover:bg-white/[0.06] hover:text-white/90
                     transition-colors duration-150"
          aria-label={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? (
            <Copy className="w-3 h-3" strokeWidth={2} />
          ) : (
            <Square className="w-3 h-3" strokeWidth={2} />
          )}
        </button>

        <button
          id="titlebar-close"
          onClick={() => appWindow.close()}
          className="inline-flex items-center justify-center w-[46px] h-full
                     text-white/60 hover:bg-[#c42b1c] hover:text-white
                     transition-colors duration-150"
          aria-label="Close"
        >
          <X className="w-3.5 h-3.5" strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}
