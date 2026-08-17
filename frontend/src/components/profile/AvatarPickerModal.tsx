'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Upload, Trash2, Check, Loader2 } from 'lucide-react';
import { UserAvatar } from '@/components/ui/user-avatar';
import {
  photoPresets,
  monogramPresets,
  resolveAvatar,
  toStoredPreset,
} from '@/components/avatars/avatarData';
import { uploadAvatarAPI, updateProfileAPI } from '@/lib/api';
import AvatarCropper from '@/components/profile/AvatarCropper';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

interface AvatarPickerModalProps {
  userId: string;
  name: string;
  currentAvatar: string | null;
  onClose: () => void;
  /** Called with the saved avatar value once the API confirms it. */
  onSaved: (avatarUrl: string | null) => void;
}

type Tab = 'upload' | 'gallery';

export default function AvatarPickerModal({
  userId,
  name,
  currentAvatar,
  onClose,
  onSaved,
}: AvatarPickerModalProps) {
  // Land on the gallery only for someone already using a preset; everyone
  // else — including brand new accounts — opens on Upload, which is what
  // "add a picture" usually means.
  const [tab, setTab] = useState<Tab>(currentAvatar?.startsWith('preset:') ? 'gallery' : 'upload');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(
    currentAvatar?.startsWith('preset:') ? currentAvatar : null,
  );
  const [file, setFile] = useState<File | null>(null);
  // The framed square the cropper produces — this, not the original file, is
  // what gets uploaded.
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleFileChosen = (chosen: File | undefined) => {
    if (!chosen) return;
    setError(null);

    if (!chosen.type.startsWith('image/')) {
      setError('Please choose an image file (JPG, PNG, WebP, or GIF).');
      return;
    }
    if (chosen.size > MAX_UPLOAD_BYTES) {
      setError('That image is larger than 5 MB. Please pick a smaller one.');
      return;
    }

    setFile(chosen);
    setCroppedBlob(null);
    setSelectedPreset(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (tab === 'upload' && file && croppedBlob) {
        // Upload the crop, not the original — named .jpg to match its encoding.
        const cropped = new File([croppedBlob], 'avatar.jpg', { type: 'image/jpeg' });
        const updated = await uploadAvatarAPI(cropped);
        onSaved(updated.avatarUrl ?? null);
      } else if (tab === 'gallery' && selectedPreset) {
        const updated = await updateProfileAPI({ avatarUrl: selectedPreset });
        onSaved(updated.avatarUrl ?? null);
      } else {
        onClose();
        return;
      }
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not save your avatar. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateProfileAPI({ avatarUrl: null });
      onSaved(null);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not remove your photo. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const canSave =
    (tab === 'upload' && Boolean(file) && Boolean(croppedBlob)) ||
    (tab === 'gallery' && Boolean(selectedPreset));

  const renderPresetTile = (presetId: string, label: string) => {
    const stored = toStoredPreset(presetId);
    const isSelected = selectedPreset === stored;
    const resolved = resolveAvatar(stored, name);

    return (
      <button
        key={presetId}
        type="button"
        onClick={() => {
          setSelectedPreset(stored);
          setFile(null);
        }}
        aria-label={label}
        aria-pressed={isSelected}
        className={`relative rounded-full transition-smooth focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-primary)] ${
          isSelected ? 'ring-2 ring-[var(--color-blue-primary)] ring-offset-2' : 'hover:opacity-80'
        }`}
        style={{ width: 56, height: 56 }}
      >
        {resolved.imageUrl ? (
          <img
            src={resolved.imageUrl}
            alt=""
            className="w-full h-full rounded-full object-cover"
          />
        ) : (
          <span
            className="w-full h-full rounded-full flex items-center justify-center font-semibold text-sm"
            style={{ background: resolved.background ?? undefined, color: resolved.foreground ?? undefined }}
          >
            {resolved.initials}
          </span>
        )}
        {isSelected && (
          <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[var(--color-blue-primary)] text-white flex items-center justify-center border-2 border-[var(--color-surface-white)]">
            <Check className="w-2.5 h-2.5" strokeWidth={3} />
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-card !max-w-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Choose your profile picture"
      >
        <div className="modal-head">
          <div>
            <p className="label !mb-0">Profile picture</p>
            <h2 className="modal-title mt-0.5">Choose how you appear</h2>
          </div>
          <button type="button" onClick={onClose} className="icon-btn" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="modal-body space-y-5">
          {/* Tighter padding/type below `sm`: at 320px the two full labels
              need more room than the control has, and the segment clips. */}
          <div className="seg w-full">
            <button
              type="button"
              className="seg-btn flex-1 justify-center min-w-0 !px-2 sm:!px-3.5 !text-[0.75rem] sm:!text-[0.8125rem]"
              data-active={tab === 'upload'}
              onClick={() => setTab('upload')}
            >
              Upload a photo
            </button>
            <button
              type="button"
              className="seg-btn flex-1 justify-center min-w-0 !px-2 sm:!px-3.5 !text-[0.75rem] sm:!text-[0.8125rem]"
              data-active={tab === 'gallery'}
              onClick={() => setTab('gallery')}
            >
              Choose an avatar
            </button>
          </div>

          {tab === 'upload' ? (
            <div className="space-y-4">
              {file ? (
                <AvatarCropper file={file} onCropChange={setCroppedBlob} />
              ) : (
                <div className="flex items-center gap-4">
                  <UserAvatar userId={userId} name={name} avatarUrl={currentAvatar} size={80} />
                  <p className="text-sm text-[var(--color-text-body)] leading-relaxed min-w-0">
                    Pick any photo — you can crop and position it before saving. JPG, PNG, WebP or
                    GIF, up to 5&nbsp;MB.
                  </p>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  handleFileChosen(e.target.files?.[0]);
                  // Let the same file be re-picked after a cancel.
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn-secondary w-full inline-flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" />
                {file ? 'Choose a different image' : 'Select an image'}
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="field-label">Portraits</p>
                <div className="flex flex-wrap gap-3">
                  {photoPresets.map((preset) => renderPresetTile(preset.id, preset.label))}
                </div>
              </div>
              <div>
                <p className="field-label">
                  Your initials <span className="optional">— no photo, just colour</span>
                </p>
                <div className="flex flex-wrap gap-3">
                  {monogramPresets.map((preset) => renderPresetTile(preset.id, preset.label))}
                </div>
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="modal-foot !justify-between">
          <button
            type="button"
            onClick={handleRemove}
            disabled={saving || !currentAvatar}
            className="inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold text-[var(--color-text-muted)] hover:text-red-600 transition-smooth disabled:opacity-40 disabled:hover:text-[var(--color-text-muted)]"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Remove
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="btn-ghost text-sm" disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave || saving}
              className="btn-primary !py-2 !px-4 text-sm inline-flex items-center gap-2 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
