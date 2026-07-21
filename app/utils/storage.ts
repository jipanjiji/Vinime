// Storage utility for Watch History Progress & Subscriptions

export interface EpisodeProgress {
  lastTime: number
  duration: number
  updatedAt: number
}

export interface AnimeHistoryItem {
  animeSlug: string
  animeTitle: string
  cover: string
  lastEpisodeNumber: string
  lastEpisodeSlug: string
  lastTime: number
  duration: number
  watchedAt: number
  episodesProgress: Record<string, EpisodeProgress>
}

export interface SubscriptionItem {
  animeSlug: string
  animeTitle: string
  cover: string
  subscribedAt: number
  type?: string
  rating?: string
}

const HISTORY_KEY = 'vnime_history'
const SUB_KEY = 'vnime_subscriptions'

// ===== HISTORY HELPERS =====
export function getHistoryList(): AnimeHistoryItem[] {
  if (import.meta.server) return []
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveEpisodeProgress(
  anime: { slug: string; title: string; cover: string },
  episode: { slug: string; episodeNumber: string },
  currentTime: number,
  duration: number
) {
  if (import.meta.server || !anime?.slug || !episode?.slug) return
  if (isNaN(currentTime) || currentTime < 0) return

  const list = getHistoryList()
  const now = Date.now()
  const animeSlug = anime.slug
  const cleanTitle = (anime.title || '').replace('Nonton Anime ', '').replace('Sub Indo', '').trim()

  let item = list.find(i => i.animeSlug === animeSlug)
  if (!item) {
    item = {
      animeSlug,
      animeTitle: cleanTitle,
      cover: anime.cover || '',
      lastEpisodeNumber: episode.episodeNumber,
      lastEpisodeSlug: episode.slug,
      lastTime: Math.floor(currentTime),
      duration: Math.floor(duration || 0),
      watchedAt: now,
      episodesProgress: {}
    }
    list.unshift(item)
  } else {
    // Move to front
    list.splice(list.indexOf(item), 1)
    list.unshift(item)
  }

  // If watched >= 95% or within 15 seconds of video end, treat as finished and reset lastTime to 0
  const isFinished = duration > 0 && (currentTime / duration >= 0.95 || (duration - currentTime) < 15)
  const savedTime = isFinished ? 0 : Math.floor(currentTime)

  // Update item fields
  item.animeTitle = cleanTitle
  if (anime.cover) item.cover = anime.cover
  item.lastEpisodeNumber = episode.episodeNumber
  item.lastEpisodeSlug = episode.slug
  item.lastTime = savedTime
  if (duration) item.duration = Math.floor(duration)
  item.watchedAt = now

  if (!item.episodesProgress) item.episodesProgress = {}
  item.episodesProgress[episode.slug] = {
    lastTime: savedTime,
    duration: Math.floor(duration || 0),
    updatedAt: now
  }

  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 30)))
  } catch {}
}

export function getAnimeHistory(animeSlug: string): AnimeHistoryItem | null {
  const list = getHistoryList()
  return list.find(i => i.animeSlug === animeSlug) || null
}

export function getEpisodeProgress(animeSlug: string, episodeSlug: string): EpisodeProgress | null {
  const history = getAnimeHistory(animeSlug)
  if (!history || !history.episodesProgress) return null
  return history.episodesProgress[episodeSlug] || null
}

export function removeHistoryItem(animeSlug: string) {
  if (import.meta.server) return
  try {
    const list = getHistoryList().filter(i => i.animeSlug !== animeSlug)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list))
  } catch {}
}

export function clearAllHistory() {
  if (import.meta.server) return
  try {
    localStorage.removeItem(HISTORY_KEY)
  } catch {}
}

// ===== SUBSCRIPTION HELPERS =====
export function getSubscriptions(): SubscriptionItem[] {
  if (import.meta.server) return []
  try {
    const raw = localStorage.getItem(SUB_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function isSubscribed(animeSlug: string): boolean {
  return getSubscriptions().some(s => s.animeSlug === animeSlug)
}

export function toggleSubscription(anime: { slug: string; title: string; cover: string; type?: string; score?: string; rating?: string }): boolean {
  if (import.meta.server || !anime?.slug) return false
  const subs = getSubscriptions()
  const cleanTitle = (anime.title || '').replace('Nonton Anime ', '').replace('Sub Indo', '').trim()
  const existsIndex = subs.findIndex(s => s.animeSlug === anime.slug)

  if (existsIndex >= 0) {
    subs.splice(existsIndex, 1)
    try {
      localStorage.setItem(SUB_KEY, JSON.stringify(subs))
    } catch {}
    return false // Now unsubscribed
  } else {
    subs.unshift({
      animeSlug: anime.slug,
      animeTitle: cleanTitle,
      cover: anime.cover || '',
      subscribedAt: Date.now(),
      type: anime.type,
      rating: anime.score || anime.rating
    })
    try {
      localStorage.setItem(SUB_KEY, JSON.stringify(subs))
    } catch {}
    return true // Now subscribed
  }
}

// Format seconds into MM:SS or HH:MM:SS
export function formatSeconds(s: number): string {
  if (!s || isNaN(s)) return '00:00'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}
