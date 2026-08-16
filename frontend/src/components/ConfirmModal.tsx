'use client';

import { useEffect, useRef } from 'react';
import { Trash2, AlertTriangle, CalendarCheck, X } from 'lucide-react';

interface ConfirmModalProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // 'info' is for confirmations that aren't destructive — asking the user to
  // vouch for something rather than warning them about it.
  variant?: 'danger' | 'warning' | 'info';
  // Overrides the small caps line above the title.
  eyebrow?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  variant = 'danger',
  eyebrow,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  const Icon = variant === 'danger' ? Trash2 : variant === 'info' ? CalendarCheck : AlertTriangle;
  const accentText =
    variant === 'danger' ? 'text-red-600' : variant === 'info' ? 'text-[var(--color-accent)]' : 'text-amber-600';
  const accentBorder =
    variant === 'danger' ? 'border-red-100' : variant === 'info' ? 'border-[rgba(11,59,145,0.14)]' : 'border-amber-100';
  const accentBg =
    variant === 'danger' ? 'bg-red-50/60' : variant === 'info' ? 'bg-[var(--color-accent-soft)]' : 'bg-amber-50/60';
  const defaultEyebrow =
    variant === 'danger' ? 'Confirm delete' : variant === 'info' ? 'Confirm' : 'Heads up';

  return (
    <div
      className="fixed inset-0 bg-[rgba(0,11,51,0.42)] backdrop-blur-sm flex items-center justify-center z-[100] fade-in"
      onClick={onCancel}
    >
      <div
        className="relative bg-[var(--color-surface-white)] rounded-2xl max-w-md w-full mx-4 border border-[var(--color-border-hairline)] overflow-hidden"
        style={{ boxShadow: 'var(--shadow-modal)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onCancel}
          className="absolute top-3.5 right-3.5 text-[var(--color-text-soft)] hover:text-[var(--color-navy)] hover:bg-[var(--color-surface-elevated)] p-1.5 rounded-md transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" strokeWidth={2} />
        </button>

        {/* Body */}
        <div className="px-5 sm:px-8 pt-7 sm:pt-8 pb-5 sm:pb-6">
          <div className={`w-11 h-11 rounded-xl ${accentBg} border ${accentBorder} flex items-center justify-center mb-5`}>
            <Icon className={`w-5 h-5 ${accentText}`} strokeWidth={1.75} />
          </div>
          <p className="label !mb-2">{eyebrow || defaultEyebrow}</p>
          <h2
            className="text-[var(--color-navy)] mb-2.5"
            style={{
              fontFamily: 'var(--font-fraunces), serif',
              fontSize: '1.625rem',
              fontWeight: 500,
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
            }}
          >
            {title}
          </h2>
          <p className="body-md leading-relaxed">{message}</p>
        </div>

        {/* Actions. Side by side once there's room; stacked full-width on a
            phone, where a long confirm label ("Yes, add to my calendar")
            otherwise wraps to a second line and leaves the two buttons
            staggered. Confirm sits at the bottom, nearest the thumb. */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 px-4 sm:px-6 py-3.5 sm:py-4 border-t border-[var(--color-border-hairline)] bg-[var(--color-surface-elevated)]">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="btn-secondary w-full sm:w-auto"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="btn-primary w-full sm:w-auto"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
