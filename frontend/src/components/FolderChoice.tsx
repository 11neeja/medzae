'use client';

import { useEffect, useRef, useState } from 'react';
import { Folder, FolderPlus } from 'lucide-react';

interface FolderChoiceProps {
  /** Folders that already exist, in sidebar order. */
  folders: string[];
  /** The chosen folder name — may be one that doesn't exist yet. */
  value: string;
  onChange: (folder: string) => void;
  label?: string;
  hint?: string;
}

/**
 * "File this under" picker: existing folders as pills, plus an inline field for
 * a folder that doesn't exist yet. The chosen name always has a pill of its
 * own, so a brand-new folder reads the same as an established one.
 */
export default function FolderChoice({
  folders,
  value,
  onChange,
  label = 'File under',
  hint,
}: FolderChoiceProps) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  const trimmed = value.trim();
  const isNewFolder = trimmed.length > 0 && !folders.includes(trimmed);

  const startNewFolder = () => {
    setDraft(isNewFolder ? trimmed : '');
    if (!isNewFolder) onChange('');
    setCreating(true);
  };

  const pickExisting = (name: string) => {
    setCreating(false);
    setDraft('');
    onChange(name);
  };

  return (
    <div>
      <p className="label !mb-2">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {folders.map(folder => (
          <button
            key={folder}
            type="button"
            onClick={() => pickExisting(folder)}
            className="folder-pill"
            data-selected={!creating && trimmed === folder}
          >
            <Folder strokeWidth={1.75} />
            <span className="folder-pill-name">{folder}</span>
          </button>
        ))}

        {/* A folder being invented, shown alongside the real ones */}
        {isNewFolder && !creating && (
          <button type="button" onClick={startNewFolder} className="folder-pill" data-selected="true">
            <FolderPlus strokeWidth={1.75} />
            <span className="folder-pill-name">{trimmed}</span>
          </button>
        )}

        {creating ? (
          <span className="folder-pill" data-selected={draft.trim().length > 0}>
            <FolderPlus strokeWidth={1.75} />
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                onChange(e.target.value.trim());
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (draft.trim()) setCreating(false);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setCreating(false);
                  setDraft('');
                  onChange(folders[0] || '');
                }
              }}
              placeholder="Name it…"
              className="folder-pill-input"
              aria-label="New folder name"
            />
          </span>
        ) : (
          <button type="button" onClick={startNewFolder} className="folder-pill">
            <FolderPlus strokeWidth={1.75} />
            <span className="folder-pill-name">New folder</span>
          </button>
        )}
      </div>

      {hint && (
        <p className="text-[11px] text-[var(--color-text-soft)] mt-2 italic" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
          {hint}
        </p>
      )}
    </div>
  );
}
