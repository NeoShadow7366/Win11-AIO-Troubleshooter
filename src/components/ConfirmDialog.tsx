import { AlertTriangle, Trash2, X } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  const iconColor =
    variant === "danger" ? "text-danger" :
    variant === "warning" ? "text-warning" : "text-accent";

  const iconBg =
    variant === "danger" ? "bg-danger/15" :
    variant === "warning" ? "bg-warning/15" : "bg-accent/15";

  const confirmBg =
    variant === "danger"
      ? "bg-danger/90 hover:bg-danger text-white"
      : variant === "warning"
      ? "bg-warning/90 hover:bg-warning text-black"
      : "bg-accent/90 hover:bg-accent text-black";

  const Icon = variant === "danger" ? Trash2 : AlertTriangle;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="glass-panel-strong w-[400px] p-5 flex flex-col gap-4 animate-slide-up">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex items-center justify-center w-10 h-10 rounded-full ${iconBg}`}>
              <Icon className={`w-5 h-5 ${iconColor}`} />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-text-primary/90">{title}</h3>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="flex items-center justify-center w-6 h-6 rounded text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-all"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Message */}
        <p className="text-[13px] text-text-secondary leading-relaxed">
          {message}
        </p>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onCancel}
            className="h-8 px-4 rounded-lg text-[12.5px] font-medium bg-surface text-text-secondary hover:bg-surface-hover transition-colors duration-200 border border-border"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`h-8 px-4 rounded-lg text-[12.5px] font-medium ${confirmBg} transition-colors duration-200 flex items-center gap-2`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
