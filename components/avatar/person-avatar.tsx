'use client'

import { useMemo } from 'react'
import { createAvatar, type Style } from '@dicebear/core'
import * as lorelei from '@dicebear/lorelei'
import * as notionists from '@dicebear/notionists'
import * as thumbs from '@dicebear/thumbs'
import { cn } from '@/lib/utils/cn'
import { INK, PASTEL, avatarFontSize, avatarLines, nameInitial, type Avatar, type AvatarSet } from '@/lib/avatar/options'

const STYLES = { notionists, lorelei, thumbs } as const
const cache = new Map<string, string>()

/** The character as a data URI, made on the device (nothing is fetched); kept per set and seed */
export function artUri(set: AvatarSet, seed: string): string {
  const key = `${set}:${seed}`
  let uri = cache.get(key)
  if (!uri) {
    uri = createAvatar(STYLES[set] as Style<object>, { seed }).toDataUri()
    cache.set(key, uri)
  }
  return uri
}

/** Thumbs bring their own colour, so the pastel does not apply to them */
export const artHasBackground = (set: AvatarSet) => set !== 'thumbs'

/**
 * A person's avatar: a rounded square holding a drawn character or a few letters. With none
 * stored (null) it is the name's initial in the app's tint, the same shape.
 */
export function PersonAvatar({ avatar, name, size, className }: { avatar: Avatar | null; name: string; size: number; className?: string }) {
  const lines = useMemo(() => (avatar?.kind === 'text' ? avatarLines(avatar.text) : []), [avatar])
  const base = 'relative flex shrink-0 select-none flex-col items-center justify-center overflow-hidden rounded-[30%]'
  const box = { width: size, height: size }
  if (!avatar) {
    return (
      <span aria-hidden className={cn(base, 'bg-primary/10 font-bold text-primary', className)} style={{ ...box, fontSize: Math.round(size * 0.42) }}>
        {nameInitial(name)}
      </span>
    )
  }
  if (avatar.kind === 'art') {
    return (
      <span aria-hidden className={cn(base, className)} style={{ ...box, backgroundColor: artHasBackground(avatar.set) ? PASTEL[avatar.bg] : undefined }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={artUri(avatar.set, avatar.seed)} alt="" draggable={false} className="h-full w-full" />
      </span>
    )
  }
  return (
    <span
      aria-hidden
      className={cn(base, 'whitespace-nowrap font-bold leading-[1.05]', className)}
      style={{ ...box, backgroundColor: PASTEL[avatar.bg], color: INK[avatar.ink], fontSize: avatarFontSize(avatar.text, size) }}
    >
      {lines.map((l, i) => (
        <span key={i}>{l}</span>
      ))}
    </span>
  )
}
