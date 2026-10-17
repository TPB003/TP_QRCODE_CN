import * as Dialog from "@radix-ui/react-dialog";
import "./confirm-dialog.css";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  error?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "取消",
  destructive = false,
  busy = false,
  error,
  onOpenChange,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="tp-confirm-dialog__overlay" />
        <Dialog.Content className="tp-confirm-dialog" aria-describedby="tp-confirm-dialog-description">
          <Dialog.Title className="tp-confirm-dialog__title">{title}</Dialog.Title>
          <Dialog.Description id="tp-confirm-dialog-description" className="tp-confirm-dialog__description">
            {description}
          </Dialog.Description>
          {error ? <p className="tp-confirm-dialog__error" role="alert">{error}</p> : null}
          <div className="tp-confirm-dialog__actions">
            <Dialog.Close asChild>
              <button type="button" className="button button--secondary" disabled={busy}>
                {cancelLabel}
              </button>
            </Dialog.Close>
            <button
              type="button"
              className={`button ${destructive ? "tp-confirm-dialog__danger" : "button--primary"}`}
              disabled={busy}
              onClick={onConfirm}
            >
              {busy ? "处理中…" : confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
