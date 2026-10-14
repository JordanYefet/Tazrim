'use client'

import { useEffect, useState } from 'react'
import { HEADER_SCROLL_INITIAL, headerScrollReducer } from '@/lib/nav/header-scroll'

/** Whether the sticky header should slide away: window scroll, read once per frame. */
export function useHeaderHidden(): boolean {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    let state = { ...HEADER_SCROLL_INITIAL, lastY: window.scrollY, anchorY: window.scrollY }
    let frame = 0
    const read = () => {
      frame = 0
      const maxY = document.documentElement.scrollHeight - window.innerHeight
      state = headerScrollReducer(state, { y: window.scrollY, maxY })
      setHidden(state.hidden)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return hidden
}
