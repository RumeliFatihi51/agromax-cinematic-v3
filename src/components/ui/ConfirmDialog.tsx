import { createPortal } from "react-dom";
import { Trash2, X } from "lucide-react";
import useDialogFocus from "../useDialogFocus";

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  closeLabel?: string;
  busy?: boolean;
  error?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export default function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  closeLabel = "Kapat",
  busy,
  error,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const ref = useDialogFocus(() => !busy && onClose());
  return createPortal(
    <div className="business-dialog-backdrop">
      <section
        ref={ref}
        className="canopy-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-description"
      >
        <button
          className="canopy-icon-button"
          aria-label={closeLabel}
          onClick={onClose}
          disabled={busy}
        >
          <X size={20} />
        </button>
        <span className="canopy-danger-icon">
          <Trash2 size={25} aria-hidden="true" />
        </span>
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-description">{description}</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button className="secondary" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            className="canopy-danger-button"
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
