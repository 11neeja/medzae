"use client"

import Link from "next/link"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { resolveAvatar } from "@/components/avatars/avatarData"
import { useUserDirectory } from "@/context/UserDirectoryContext"
import { cn } from "@/lib/utils"

interface UserAvatarProps {
  userId: string
  name?: string
  /**
   * The avatar the API returned with this person. Pass it whenever you have
   * it — it is authoritative. When omitted, the user directory is consulted,
   * and failing that the person renders as their initials.
   */
  avatarUrl?: string | null
  size?: number
  className?: string
  /** Wrap the avatar in a link to this person's profile. */
  linkToProfile?: boolean
}

export function UserAvatar({
  userId,
  name,
  avatarUrl,
  size = 40,
  className,
  linkToProfile,
}: UserAvatarProps) {
  const directory = useUserDirectory()
  const resolved = resolveAvatar(avatarUrl ?? directory.getAvatar(userId), name)

  // Initials shrink with the tile — at 16px (a group-member stack) two
  // letters at 12px would spill out of the circle.
  const fontSize = Math.max(9, Math.round(size * 0.36))

  const avatar = (
    <Avatar
      className={cn("shrink-0", className)}
      style={{ width: size, height: size }}
    >
      {resolved.imageUrl && (
        <AvatarImage
          src={resolved.imageUrl}
          alt={name ? `${name} avatar` : "User avatar"}
        />
      )}
      <AvatarFallback
        className="font-semibold bg-[var(--color-accent-soft)] text-[var(--color-blue-primary)]"
        style={
          resolved.background
            ? { background: resolved.background, color: resolved.foreground ?? "#fff", fontSize }
            : { fontSize }
        }
      >
        {resolved.initials}
      </AvatarFallback>
    </Avatar>
  )

  if (!linkToProfile || !userId) return avatar

  return (
    <Link
      href={`/u/${userId}`}
      aria-label={name ? `View ${name}'s profile` : "View profile"}
      className="shrink-0 rounded-full transition-opacity hover:opacity-85 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-primary)] focus-visible:ring-offset-2"
      // Avatars often sit inside a card that is itself clickable.
      onClick={(e) => e.stopPropagation()}
    >
      {avatar}
    </Link>
  )
}
