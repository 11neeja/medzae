/**
 * Avatar presets.
 *
 * Avatars used to be *derived*: the display name was run through first-name
 * dictionaries and suffix rules to guess a gender, and that guess picked a
 * stock portrait. Nobody chose their own face, and the guess was wrong often
 * enough to be worse than no picture at all.
 *
 * Now an avatar is only ever something the person picked: an uploaded photo
 * (stored as an absolute URL) or one of the presets below (stored as
 * `preset:<id>`). Anything else — including a brand new account — renders as
 * initials, which is honest and looks deliberate.
 */

import { assetUrl } from "@/lib/api"

export type AvatarPresetKind = "photo" | "monogram"

export interface AvatarPreset {
  id: string
  label: string
  kind: AvatarPresetKind
  /** photo presets */
  imageUrl?: string
  /** monogram presets — a CSS background behind the person's initials */
  background?: string
  foreground?: string
}

/** Illustrated portraits. */
export const photoPresets: AvatarPreset[] = [
  { id: "p1", label: "Portrait 1", kind: "photo", imageUrl: "https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-1.png" },
  { id: "p2", label: "Portrait 2", kind: "photo", imageUrl: "https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-2.png" },
  { id: "p3", label: "Portrait 3", kind: "photo", imageUrl: "https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-3.png" },
  { id: "p4", label: "Portrait 4", kind: "photo", imageUrl: "https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-5.png" },
  { id: "p5", label: "Portrait 5", kind: "photo", imageUrl: "https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-6.png" },
  { id: "p6", label: "Portrait 6", kind: "photo", imageUrl: "https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-7.png" },
  { id: "p7", label: "Portrait 7", kind: "photo", imageUrl: "https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-9.png" },
  { id: "p8", label: "Portrait 8", kind: "photo", imageUrl: "https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-16.png" },
]

/**
 * Monograms — the person's own initials on a colour. These need no network
 * request and never misrepresent anyone, so they make a good default choice
 * for people who don't want a picture.
 */
export const monogramPresets: AvatarPreset[] = [
  { id: "m-navy", label: "Navy", kind: "monogram", background: "linear-gradient(135deg, #1B2A4A 0%, #33507F 100%)", foreground: "#FFFFFF" },
  { id: "m-blue", label: "Blue", kind: "monogram", background: "linear-gradient(135deg, #2F6FDA 0%, #5B9BF5 100%)", foreground: "#FFFFFF" },
  { id: "m-teal", label: "Teal", kind: "monogram", background: "linear-gradient(135deg, #0F766E 0%, #2DB3A6 100%)", foreground: "#FFFFFF" },
  { id: "m-plum", label: "Plum", kind: "monogram", background: "linear-gradient(135deg, #5B2C6F 0%, #9B59B6 100%)", foreground: "#FFFFFF" },
  { id: "m-clay", label: "Clay", kind: "monogram", background: "linear-gradient(135deg, #9A4B2F 0%, #D98261 100%)", foreground: "#FFFFFF" },
  { id: "m-moss", label: "Moss", kind: "monogram", background: "linear-gradient(135deg, #3F6212 0%, #7BA23F 100%)", foreground: "#FFFFFF" },
  { id: "m-slate", label: "Slate", kind: "monogram", background: "linear-gradient(135deg, #475569 0%, #7C8BA1 100%)", foreground: "#FFFFFF" },
  { id: "m-sand", label: "Sand", kind: "monogram", background: "linear-gradient(135deg, #E8DCC8 0%, #F5EEE2 100%)", foreground: "#1B2A4A" },
]

export const avatarPresets: AvatarPreset[] = [...photoPresets, ...monogramPresets]

const PRESET_PREFIX = "preset:"

const presetsById = new Map(avatarPresets.map((preset) => [preset.id, preset]))

/** Turn a preset id into the value stored on the user record. */
export function toStoredPreset(presetId: string): string {
  return `${PRESET_PREFIX}${presetId}`
}

export function isPresetValue(avatarUrl?: string | null): boolean {
  return typeof avatarUrl === "string" && avatarUrl.startsWith(PRESET_PREFIX)
}

export function getPreset(avatarUrl?: string | null): AvatarPreset | null {
  if (!isPresetValue(avatarUrl)) return null
  return presetsById.get(avatarUrl!.slice(PRESET_PREFIX.length)) ?? null
}

export interface ResolvedAvatar {
  /** src for an <img>, when the avatar is a photo or upload */
  imageUrl: string | null
  /** CSS background for a monogram tile */
  background: string | null
  foreground: string | null
  initials: string
}

/**
 * Work out what to actually render for a user.
 * `avatarUrl` is whatever the API returned: an absolute upload URL, a
 * `preset:<id>` string, or nothing at all.
 */
export function resolveAvatar(avatarUrl?: string | null, name?: string | null): ResolvedAvatar {
  const initials = getInitialsForName(name || "")

  const preset = getPreset(avatarUrl)
  if (preset) {
    return {
      imageUrl: preset.kind === "photo" ? preset.imageUrl ?? null : null,
      background: preset.kind === "monogram" ? preset.background ?? null : null,
      foreground: preset.kind === "monogram" ? preset.foreground ?? null : null,
      initials,
    }
  }

  // An uploaded photo: absolute Cloudinary URL in production, /uploads/... in
  // dev — the latter lives on the API host, so it needs resolving.
  if (avatarUrl && (/^https?:\/\//i.test(avatarUrl) || avatarUrl.startsWith("/uploads/"))) {
    return { imageUrl: assetUrl(avatarUrl), background: null, foreground: null, initials }
  }

  return { imageUrl: null, background: null, foreground: null, initials }
}

export function getInitialsForName(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return initials || "?"
}
