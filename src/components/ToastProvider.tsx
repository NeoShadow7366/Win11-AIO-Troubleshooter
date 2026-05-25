import { createContext, useContext, useState, useCallback, useRef } from "react";
import { X, CheckCircle2, AlertTriangle, AlertCircle, Info } from "lucide-react";

/* ─── Types ─── */
type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  exiting: boolean;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType>({
  showToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

/* ─── Config ─── */
const MAX_TOASTS = 3;
const AUTO_DISMISS_MS = 4000;
const EXIT_DURATION_MS = 200;

const TOAST_STYLES: Record<ToastType, { bg: string; border: string; icon: string; text: string }> = {
  success: {
    bg: "bg-success/10",
    border: "border-success/25",
    icon: "text-success",
    text: "text-success/90",
  },
  error: {
    bg: "bg-danger/10",
    border: "border-danger/25",
    icon: "text-danger",
    text: "text-danger/90",
  },
  warning: {
    bg: "bg-warning/10",
    border: "border-warning/25",
    icon: "text-warning",
    text: "text-warning/90",
  },
  info: {
    bg: "bg-accent/10",
    border: "border-accent/25",
    icon: "text-accent",
    text: "text-accent/90",
  },
};

const TOAST_ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4" />,
  error: <AlertCircle className="w-4 h-4" />,
  warning: <AlertTriangle className="w-4 h-4" />,
  info: <Info className="w-4 h-4" />,
};

/* ─── Provider ─── */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, EXIT_DURATION_MS);
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "info") => {
      const id = ++idRef.current;
      const newToast: Toast = { id, message, type, exiting: false };

      setToasts((prev) => {
        const next = [...prev, newToast];
        // If over max, dismiss the oldest
        if (next.length > MAX_TOASTS) {
          const oldest = next[0];
          setTimeout(() => dismissToast(oldest.id), 0);
        }
        return next;
      });

      // Auto-dismiss
      setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
    },
    [dismissToast]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Toast Container */}
      <div
        id="toast-container"
        className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
        style={{ maxWidth: "380px" }}
      >
        {toasts.map((toast) => {
          const styles = TOAST_STYLES[toast.type];
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl
                         backdrop-blur-xl border shadow-lg shadow-black/20
                         ${styles.bg} ${styles.border}
                         ${toast.exiting ? "toast-exit" : "toast-enter"}`}
            >
              <span className={`${styles.icon} shrink-0 mt-0.5`}>
                {TOAST_ICONS[toast.type]}
              </span>
              <p className={`text-[13px] leading-relaxed flex-1 ${styles.text}`}>
                {toast.message}
              </p>
              <button
                onClick={() => dismissToast(toast.id)}
                className="shrink-0 flex items-center justify-center w-5 h-5 rounded
                           text-white/25 hover:text-white/60 hover:bg-white/[0.06]
                           transition-all duration-150 mt-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
