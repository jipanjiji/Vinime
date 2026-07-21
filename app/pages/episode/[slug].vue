<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick, computed } from 'vue'
import { useRoute, useRouter } from '#app'
import Hls from 'hls.js'
import { saveEpisodeProgress, getEpisodeProgress } from '~/utils/storage'
import { fetchClientEpisode, resolveClientVideoUrl } from '~/utils/clientScraper'

const route = useRoute()
const router = useRouter()
const epSlug = ref(route.params.slug)

// Stream states
const isResolving = ref(true)
const errorMsg = ref('')
const selectedVideo = ref(null)
const qualityGroups = ref({})
const availableQualities = ref([])
const selectedQuality = ref('')
const currentHostIndex = ref(0)
const showQualityMenu = ref(false)

// Parent anime & Episode Navigation
const parentAnime = ref(null)
const currentEpisodeNumber = ref('')
const autoNext = ref(true)

const currentEpIndex = computed(() => {
  if (!parentAnime.value?.episodes) return -1
  return parentAnime.value.episodes.findIndex(e => e.slug === epSlug.value)
})

const prevEpisode = computed(() => {
  if (currentEpIndex.value > 0 && parentAnime.value?.episodes) {
    return parentAnime.value.episodes[currentEpIndex.value - 1]
  }
  return null
})

const nextEpisode = computed(() => {
  if (
    currentEpIndex.value >= 0 &&
    parentAnime.value?.episodes &&
    currentEpIndex.value < parentAnime.value.episodes.length - 1
  ) {
    return parentAnime.value.episodes[currentEpIndex.value + 1]
  }
  return null
})

// Custom player states
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(1)
const isMuted = ref(false)
const isFullscreen = ref(false)
const showControls = ref(true)
const isBuffering = ref(false)
const playbackSpeed = ref(1)
let controlsTimeoutId = null
let lastSavedSecond = 0
let hasSeekedInitial = false

const progressPercent = computed(() =>
  duration.value ? (currentTime.value / duration.value) * 100 : 0
)

let hlsInstance = null

const HOST_PRIORITY = [
  'odstream',
  'wibufile', 'filedon', 'nakama', 'krakenfiles',
  'premium', 'updesu',
  'pixeldrain',
  'vidhide', 'vidlion',
  'blogspot', 'mega'
]

function getHostPriority(label) {
  const l = label.toLowerCase()
  for (let i = 0; i < HOST_PRIORITY.length; i++) {
    if (l.includes(HOST_PRIORITY[i])) return i
  }
  return 99
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeyDown)
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  await loadEpisodeData()
})

onBeforeUnmount(() => {
  saveCurrentProgress()
  destroyHls()
  window.removeEventListener('keydown', handleKeyDown)
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
})

watch(
  () => route.params.slug,
  async (newSlug) => {
    saveCurrentProgress()
    epSlug.value = newSlug
    showQualityMenu.value = false
    hasSeekedInitial = false
    await loadEpisodeData()
  }
)

function handleFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
}

function destroyHls() {
  if (hlsInstance) {
    hlsInstance.destroy()
    hlsInstance = null
  }
}

async function loadEpisodeData() {
  isResolving.value = true
  errorMsg.value = ''
  selectedVideo.value = null
  qualityGroups.value = {}
  availableQualities.value = []
  selectedQuality.value = ''
  currentHostIndex.value = 0
  isPlaying.value = false
  currentTime.value = 0
  duration.value = 0
  isBuffering.value = false
  showControls.value = true
  playbackSpeed.value = 1
  hasSeekedInitial = false
  destroyHls()

  try {
    // Run server scrape + client-side Kuronime hash fetch in parallel
    const [data, hashData] = await Promise.all([
      $fetch(`/api/episode?slug=${encodeURIComponent(epSlug.value)}`).catch(() => null),
      $fetch(`/api/kuronime-hash?slug=${encodeURIComponent(epSlug.value)}`).catch(() => null)
    ])

    // Merge client-side Kuronime sources if server scraping was blocked
    const allSources = [...(data?.videoSources || [])]

    if (hashData?.success) {
      // 1. Add direct HTML links (Pixeldrain, Krakenfiles extracted from page HTML)
      for (const d of (hashData.directLinks || [])) {
        if (!allSources.some(s => s.url === d.url)) {
          allSources.push({
            label: `[Kuronime Direct] ${d.mirror} (${d.quality})`,
            url: d.url,
            quality: d.quality
          })
        }
      }

      // 2. If hash available, call animeku.org API directly from browser (user's home IP — NOT blocked)
      if (hashData.hash) {
        try {
          const proxyRes = await $fetch('/api/animeku-proxy', {
            method: 'POST',
            body: { id: hashData.hash, referer: hashData.kuronimeUrl }
          }).catch(() => null)

          if (proxyRes?.success && proxyRes.data?.status === 200 && proxyRes.data?.mirror) {
            const json = proxyRes.data
              const { default: CryptoJS } = await import('crypto-js')

              const CryptoJSAesJson = {
                parse: function(jsonStr) {
                  const j = JSON.parse(jsonStr)
                  const cp = CryptoJS.lib.CipherParams.create({ ciphertext: CryptoJS.enc.Base64.parse(j.ct) })
                  if (j.iv) cp.iv = CryptoJS.enc.Hex.parse(j.iv)
                  if (j.s) cp.salt = CryptoJS.enc.Hex.parse(j.s)
                  return cp
                }
              }

              const decryptedBase64 = atob(json.mirror)
              const decryptedBytes = CryptoJS.AES.decrypt(decryptedBase64, '3&!Z0M,VIZ;dZW==', { format: CryptoJSAesJson })
              const decryptedData = JSON.parse(decryptedBytes.toString(CryptoJS.enc.Utf8))

              // Add embed sources
              const embed = decryptedData.embed || {}
              for (const quality in embed) {
                const servers = embed[quality]
                const cleanQ = quality.replace(/^v/, '')
                for (const serverName in servers) {
                  const url = servers[serverName]
                  if (url && !allSources.some(s => s.url === url)) {
                    allSources.push({ label: `[Kuronime] ${serverName} (${cleanQ})`, url, quality: cleanQ })
                  }
                }
              }

              // Add direct download mirrors
              const download = decryptedData.download || {}
              for (const quality in download) {
                const mirrors = download[quality]
                const cleanQ = quality.replace(/^v/, '')
                for (const mirrorName in mirrors) {
                  const url = mirrors[mirrorName]
                  if (url && (url.includes('pixeldrain.com') || url.includes('krakenfiles.com') || url.includes('gofile.io') || url.includes('acefile.co'))) {
                    if (!allSources.some(s => s.url === url)) {
                      allSources.push({ label: `[Kuronime Direct] ${mirrorName} (${cleanQ})`, url, quality: cleanQ })
                    }
                  }
                }
              }
            }
        } catch (animekuErr) {
          console.warn('[Client] animeku.org call failed:', animekuErr)
        }
      }
    }

    if (allSources.length === 0) {
      // Direct Native Client Scrape on user's device (bypasses Vercel Server 500/403)
      const clientResult = await fetchClientEpisode(epSlug.value)
      if (clientResult?.success) {
        allSources.push(...clientResult.videoSources)
      }
    }

    if (allSources.length > 0) {
      parentAnime.value = data?.anime

      if (!parentAnime.value) {
        const deducedSlug = epSlug.value
          .replace(/^nonton-/, '')
          .replace(/-episode-\d+.*$/, '')
          .replace(/-eps-\d+.*$/, '')
        const clientAnime = await fetchClientAnimeDetail(deducedSlug)
        if (clientAnime?.success) {
          parentAnime.value = clientAnime
        }
      }

      if (parentAnime.value?.episodes) {
        const cur = parentAnime.value.episodes.find(e => e.slug === epSlug.value)
        if (cur) {
          currentEpisodeNumber.value = cur.episodeNumber
        } else {
          const matchNum = epSlug.value.match(/(?:episode|eps)-(\d+)/i)
          if (matchNum) currentEpisodeNumber.value = matchNum[1]
        }
      }

      const groups = {}
      allSources.forEach(src => {
        const q = src.quality || 'unknown'
        if (!groups[q]) groups[q] = []
        groups[q].push(src)
      })
      for (const q in groups) {
        groups[q].sort((a, b) => getHostPriority(a.label) - getHostPriority(b.label))
      }
      qualityGroups.value = groups

      const getQVal = (q) => q.toLowerCase() === '4k' ? 2160 : (parseInt(q) || 0)
      availableQualities.value = Object.keys(groups)
        .filter(q => q !== 'unknown')
        .sort((a, b) => getQVal(a) - getQVal(b))
      if (availableQualities.value.length === 0) {
        availableQualities.value = Object.keys(groups)
      }

      const preferredOrder = ['1080p', '720p', '480p', '360p']
      let defaultQ = preferredOrder.find(q => availableQualities.value.includes(q))
        || availableQualities.value[availableQualities.value.length - 1]
        || ''

      if (defaultQ) {
        selectedQuality.value = defaultQ
        playResolution(defaultQ, 0)
      }
    } else {
      errorMsg.value = data.message || 'Tidak ada stream tersedia.'
      isResolving.value = false
    }
  } catch (err) {
    errorMsg.value = err.message || 'Gagal memuat stream.'
    isResolving.value = false
  }
}

async function playResolution(quality, hostIndex = 0) {
  const sources = qualityGroups.value[quality]
  if (!sources || sources.length === 0) return

  if (hostIndex >= sources.length) {
    console.warn(`[Failover Engine] All mirrors failed for quality: ${quality}`)
    const qIndex = availableQualities.value.indexOf(quality)
    if (qIndex > 0) {
      const nextQuality = availableQualities.value[qIndex - 1]
      console.info(`[Failover Engine] Falling back to lower quality: ${nextQuality}`)
      playResolution(nextQuality, 0)
    } else {
      errorMsg.value = `Gagal memutar video. Semua server cermin offline.`
      isResolving.value = false
      selectedVideo.value = null
      destroyHls()
    }
    return
  }

  const src = sources[hostIndex]
  currentHostIndex.value = hostIndex
  selectedQuality.value = quality
  isResolving.value = true
  errorMsg.value = ''
  destroyHls()
  selectedVideo.value = null
  showQualityMenu.value = false

  try {
    let resolveData = await $fetch(`/api/resolve?url=${encodeURIComponent(src.url)}`).catch(() => null)

    if (!resolveData?.success) {
      const clientResolved = await resolveClientVideoUrl(src.url)
      if (clientResolved?.rawVideoUrl) {
        resolveData = {
          success: true,
          rawVideoUrl: clientResolved.rawVideoUrl,
          isHls: clientResolved.isHls
        }
      }
    }

    if (!resolveData?.success || !resolveData.rawVideoUrl) {
      playResolution(quality, hostIndex + 1)
      return
    }

    const rawUrl = resolveData.rawVideoUrl
    const isDirectPlay = rawUrl.includes('wibufile.com') || rawUrl.includes('archive.org') ||
      rawUrl.includes('cloudflarestorage.com') || rawUrl.includes('filedon.co') ||
      rawUrl.includes('googlevideo.com') || rawUrl.includes('blogger.com') ||
      rawUrl.includes('blogspot.com') || rawUrl.includes('googleusercontent.com') ||
      rawUrl.includes('pixeldrain.com') || rawUrl.includes('krakenfiles.com')

    const playUrl = isDirectPlay
      ? rawUrl
      : `/api/proxy?url=${encodeURIComponent(rawUrl)}&referer=${encodeURIComponent(src.url)}`

    selectedVideo.value = {
      title: src.label,
      quality,
      playUrl,
      isHls: rawUrl.includes('m3u8') || Boolean(resolveData.isHls)
    }
    isResolving.value = false

    nextTick(() => {
      const videoEl = document.getElementById('vnime-player')
      if (!videoEl) return

      const applyInitialSeek = () => {
        if (hasSeekedInitial) return
        hasSeekedInitial = true

        let targetTime = 0
        if (route.query.t) {
          targetTime = parseFloat(route.query.t) || 0
        } else if (parentAnime.value) {
          const prog = getEpisodeProgress(parentAnime.value.slug, epSlug.value)
          if (prog && prog.lastTime > 3) {
            const isFinished = prog.duration > 0 && (prog.lastTime / prog.duration >= 0.95 || (prog.duration - prog.lastTime) < 15)
            if (!isFinished) {
              targetTime = prog.lastTime
            } else {
              saveEpisodeProgress(
                parentAnime.value,
                { slug: epSlug.value, episodeNumber: currentEpisodeNumber.value },
                0,
                prog.duration
              )
            }
          }
        }

        if (targetTime > 0 && targetTime < (videoEl.duration || 99999)) {
          videoEl.currentTime = targetTime
          currentTime.value = targetTime
        }
      }

      if (selectedVideo.value.isHls) {
        if (Hls.isSupported()) {
          hlsInstance = new Hls()
          hlsInstance.loadSource(playUrl)
          hlsInstance.attachMedia(videoEl)
          hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
            applyInitialSeek()
            videoEl.play().catch(() => {})
          })
          hlsInstance.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) {
              destroyHls()
              playResolution(quality, hostIndex + 1)
            }
          })
        } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
          videoEl.src = playUrl
          applyInitialSeek()
          videoEl.play().catch(() => {})
        }
      } else {
        videoEl.onerror = null
        videoEl.onerror = () => {
          videoEl.onerror = null
          playResolution(quality, hostIndex + 1)
        }
        videoEl.src = playUrl
        videoEl.load()
        videoEl.onloadedmetadata = () => {
          applyInitialSeek()
        }
        videoEl.play().catch(e => {
          if (e.name !== 'NotAllowedError') console.warn('Play error:', e.message)
        })
      }
    })
  } catch {
    playResolution(quality, hostIndex + 1)
  }
}

function saveCurrentProgress() {
  if (!parentAnime.value || !epSlug.value || !currentTime.value) return
  saveEpisodeProgress(
    parentAnime.value,
    { slug: epSlug.value, episodeNumber: currentEpisodeNumber.value },
    currentTime.value,
    duration.value
  )
}

// Player controls
function handleMouseMove() {
  showControls.value = true
  if (controlsTimeoutId) clearTimeout(controlsTimeoutId)
  controlsTimeoutId = setTimeout(() => {
    if (isPlaying.value && !isBuffering.value) showControls.value = false
  }, 2500)
}

function formatTime(s) {
  if (isNaN(s)) return '0:00'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  const pad = n => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

function togglePlay() {
  const v = document.getElementById('vnime-player')
  if (!v) return
  v.paused
    ? v.play().then(() => { isPlaying.value = true }).catch(() => {})
    : (v.pause(), isPlaying.value = false, saveCurrentProgress())
}

function handleTimeUpdate(e) {
  currentTime.value = e.target.currentTime
  const sec = Math.floor(currentTime.value)
  if (sec - lastSavedSecond >= 3) {
    lastSavedSecond = sec
    saveCurrentProgress()
  }
}
function handleDurationChange(e) { duration.value = e.target.duration }
function handleWaiting() { isBuffering.value = true }
function handlePlaying() { isBuffering.value = false; isPlaying.value = true }
function handlePlay() { isPlaying.value = true }
function handlePause() { isPlaying.value = false; saveCurrentProgress() }

function handleEnded() {
  saveCurrentProgress()
  if (autoNext.value && nextEpisode.value) {
    router.push(`/episode/${nextEpisode.value.slug}`)
  }
}

function seekVideo() {
  const v = document.getElementById('vnime-player')
  if (v) {
    v.currentTime = currentTime.value
    saveCurrentProgress()
  }
}

function toggleMute() {
  const v = document.getElementById('vnime-player')
  if (!v) return
  isMuted.value = !isMuted.value
  v.muted = isMuted.value
  volume.value = isMuted.value ? 0 : (v.volume || 1)
}

function handleVolumeChange() {
  const v = document.getElementById('vnime-player')
  if (!v) return
  v.volume = volume.value
  v.muted = volume.value === 0
  isMuted.value = volume.value === 0
}

const isHolding2x = ref(false)
let holdTimer = null
let previousSpeedRate = 1.0

function startHoldSpeed(e) {
  if (e && e.button && e.button !== 0) return
  if (holdTimer) clearTimeout(holdTimer)
  holdTimer = setTimeout(() => {
    const v = document.getElementById('vnime-player')
    if (v && !v.paused) {
      previousSpeedRate = v.playbackRate || 1.0
      v.playbackRate = 2.0
      isHolding2x.value = true
    }
  }, 220)
}

function stopHoldSpeed() {
  if (holdTimer) {
    clearTimeout(holdTimer)
    holdTimer = null
  }
  if (isHolding2x.value) {
    const v = document.getElementById('vnime-player')
    if (v) {
      v.playbackRate = playbackSpeed.value || previousSpeedRate || 1.0
    }
    isHolding2x.value = false
  }
}

function toggleSpeed() {
  const v = document.getElementById('vnime-player')
  if (!v) return
  const speeds = [1, 1.25, 1.5, 2]
  let next = speeds.indexOf(playbackSpeed.value) + 1
  if (next >= speeds.length) next = 0
  playbackSpeed.value = speeds[next]
  v.playbackRate = playbackSpeed.value
}

function toggleFullscreen() {
  const c = document.getElementById('video-container')
  if (!c) return
  document.fullscreenElement
    ? document.exitFullscreen().then(() => { isFullscreen.value = false })
    : c.requestFullscreen().then(() => { isFullscreen.value = true }).catch(() => {})
}

function seekRelative(amount) {
  const v = document.getElementById('vnime-player')
  if (v) {
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + amount))
    saveCurrentProgress()
  }
}

function handleKeyDown(e) {
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return
  const v = document.getElementById('vnime-player')
  if (!v) return
  switch (e.key.toLowerCase()) {
    case ' ': e.preventDefault(); togglePlay(); break
    case 'arrowleft': e.preventDefault(); seekRelative(-10); break
    case 'arrowright': e.preventDefault(); seekRelative(10); break
    case 'arrowup': e.preventDefault(); volume.value = Math.min(1, parseFloat((volume.value + 0.1).toFixed(2))); handleVolumeChange(); break
    case 'arrowdown': e.preventDefault(); volume.value = Math.max(0, parseFloat((volume.value - 0.1).toFixed(2))); handleVolumeChange(); break
    case 'f': e.preventDefault(); toggleFullscreen(); break
  }
}
</script>

<template>
  <div class="w-full">

    <div class="max-w-7xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-6">

      <!-- Back link -->
      <div class="mb-4 anim-fade-down">
        <NuxtLink
          v-if="parentAnime"
          :to="`/anime/${parentAnime.slug}`"
          class="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-white font-medium transition-colors"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"/></svg>
          Semua Episode
        </NuxtLink>
        <NuxtLink v-else to="/" class="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-white font-medium transition-colors">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"/></svg>
          Beranda
        </NuxtLink>
      </div>

      <!-- ===== VIDEO CONTAINER ===== -->
      <div
        id="video-container"
        class="relative bg-black overflow-hidden select-none rounded-2xl border border-[var(--border-subtle)] shadow-2xl shadow-black/50 anim-fade-up"
        style="aspect-ratio: 16/9;"
        @mousemove="handleMouseMove"
        @mouseleave="showControls = false; stopHoldSpeed()"
        @click.self="togglePlay"
        @touchstart="startHoldSpeed"
        @touchend="stopHoldSpeed"
        @touchcancel="stopHoldSpeed"
        @mousedown="startHoldSpeed"
        @mouseup="stopHoldSpeed"
      >
        <!-- YouTube-Style 2x Speed Hold Badge -->
        <div
          v-if="isHolding2x"
          class="absolute top-5 left-1/2 -translate-x-1/2 z-30 bg-black/80 backdrop-blur-md border border-amber-500/40 px-4 py-1.5 rounded-full flex items-center gap-2 text-xs font-extrabold text-amber-400 animate-pulse shadow-xl shadow-amber-500/20 pointer-events-none"
        >
          <svg class="w-4 h-4 fill-amber-400" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          <span>2x Speed</span>
        </div>
        <!-- Loading overlay -->
        <div v-if="isResolving" class="absolute inset-0 z-20 bg-[var(--bg-primary)] flex flex-col items-center justify-center gap-4">
          <div class="relative">
            <div class="w-12 h-12 rounded-full border-2 border-[var(--border-subtle)] border-t-[var(--accent)] animate-spin"></div>
          </div>
          <p class="text-xs text-[var(--text-secondary)] font-medium">Mencari stream terbaik...</p>
        </div>

        <!-- Error overlay -->
        <div v-else-if="errorMsg && !selectedVideo" class="absolute inset-0 z-20 bg-[var(--bg-primary)] flex flex-col items-center justify-center gap-3 px-6 text-center">
          <div class="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <svg class="w-6 h-6 text-red-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg>
          </div>
          <p class="text-sm font-semibold text-[var(--text-primary)]">Gagal memuat video</p>
          <p class="text-xs text-[var(--text-muted)] max-w-sm">{{ errorMsg }}</p>
          <button @click="loadEpisodeData" class="mt-1 px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-xs font-bold text-white rounded-xl transition-colors">Coba Lagi</button>
        </div>

        <!-- Native HTML5 Video Element (for Pixeldrain / Krakenfiles / MP4 / HLS streams) -->
        <video
          id="vnime-player"
          playsinline
          class="w-full h-full object-contain"
          @click="togglePlay"
          @timeupdate="handleTimeUpdate"
          @durationchange="handleDurationChange"
          @waiting="handleWaiting"
          @playing="handlePlaying"
          @play="handlePlay"
          @pause="handlePause"
          @ended="handleEnded"
        />

        <!-- Buffering spinner -->
        <div v-if="isBuffering && !isResolving" class="absolute inset-0 flex items-center justify-center bg-black/30 z-10 pointer-events-none">
          <div class="w-12 h-12 rounded-full border-2 border-white/20 border-t-white animate-spin"></div>
        </div>

        <!-- ===== TOP-LEFT ANIME & EPISODE INFO OVERLAY ===== -->
        <div
          class="absolute top-4 left-4 sm:top-5 sm:left-6 z-10 transition-opacity duration-300 pointer-events-none"
          :class="(showControls || !isPlaying) && selectedVideo ? 'opacity-100' : 'opacity-0'"
        >
          <h2 v-if="parentAnime" class="text-sm sm:text-lg font-extrabold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] truncate max-w-[200px] sm:max-w-md">
            {{ parentAnime.title.replace('Nonton Anime ', '').replace('Sub Indo', '').trim() }}
          </h2>
          <p v-if="currentEpisodeNumber" class="text-xs sm:text-sm text-white/80 font-semibold drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] mt-0.5">
            Episode {{ currentEpisodeNumber }}
          </p>
        </div>

        <!-- ===== CENTER CONTROLS OVERLAY ===== -->
        <div
          v-if="!isBuffering && !isResolving && selectedVideo"
          class="absolute inset-0 flex items-center justify-center gap-3 sm:gap-7 z-10 transition-opacity duration-300"
          :class="(showControls || !isPlaying) ? 'opacity-100' : 'opacity-0 pointer-events-none'"
        >
          <!-- 1. Previous Episode -->
          <NuxtLink
            v-if="prevEpisode"
            :to="`/episode/${prevEpisode.slug}`"
            class="flex flex-col items-center gap-1 group/btn cursor-pointer text-white/80 hover:text-white transition-all active:scale-95"
            title="Episode Sebelumnya"
          >
            <div class="w-10 h-10 sm:w-13 sm:h-13 rounded-full bg-black/50 backdrop-blur-md border border-white/20 flex items-center justify-center group-hover/btn:scale-110 group-hover/btn:bg-white/20 transition-all shadow-xl">
              <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
            </div>
            <span class="text-[10px] sm:text-xs font-bold drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] opacity-90 group-hover/btn:opacity-100">
              Episode {{ prevEpisode.episodeNumber }}
            </span>
          </NuxtLink>

          <!-- 2. Rewind 10s (CLEAN SVG WITHOUT COLLISION) -->
          <button
            @click="seekRelative(-10)"
            class="flex flex-col items-center gap-1 group/btn cursor-pointer text-white/80 hover:text-white transition-all active:scale-95"
            title="Mundur 10 Detik"
          >
            <div class="w-10 h-10 sm:w-13 sm:h-13 rounded-full bg-black/50 backdrop-blur-md border border-white/20 flex flex-col items-center justify-center group-hover/btn:scale-110 group-hover/btn:bg-white/20 transition-all shadow-xl">
              <svg class="w-5 h-5 fill-none stroke-current stroke-[2.2]" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"/></svg>
              <span class="text-[9px] font-extrabold -mt-1 leading-none tracking-tight">10</span>
            </div>
          </button>

          <!-- 3. Main Play/Pause Button -->
          <button
            @click="togglePlay"
            class="w-14 h-14 sm:w-18 sm:h-18 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 transition-all duration-300 shadow-2xl active:scale-95"
            title="Play/Pause"
          >
            <svg v-if="isPlaying" class="w-7 h-7 sm:w-9 sm:h-9 fill-current" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            <svg v-else class="w-7 h-7 sm:w-9 sm:h-9 fill-current ml-1" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </button>

          <!-- 4. Forward 10s (CLEAN SVG WITHOUT COLLISION) -->
          <button
            @click="seekRelative(10)"
            class="flex flex-col items-center gap-1 group/btn cursor-pointer text-white/80 hover:text-white transition-all active:scale-95"
            title="Maju 10 Detik"
          >
            <div class="w-10 h-10 sm:w-13 sm:h-13 rounded-full bg-black/50 backdrop-blur-md border border-white/20 flex flex-col items-center justify-center group-hover/btn:scale-110 group-hover/btn:bg-white/20 transition-all shadow-xl">
              <svg class="w-5 h-5 fill-none stroke-current stroke-[2.2]" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3"/></svg>
              <span class="text-[9px] font-extrabold -mt-1 leading-none tracking-tight">10</span>
            </div>
          </button>

          <!-- 5. Next Episode -->
          <NuxtLink
            v-if="nextEpisode"
            :to="`/episode/${nextEpisode.slug}`"
            class="flex flex-col items-center gap-1 group/btn cursor-pointer text-white/80 hover:text-white transition-all active:scale-95"
            title="Episode Selanjutnya"
          >
            <div class="w-10 h-10 sm:w-13 sm:h-13 rounded-full bg-black/50 backdrop-blur-md border border-white/20 flex items-center justify-center group-hover/btn:scale-110 group-hover/btn:bg-white/20 transition-all shadow-xl">
              <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
            </div>
            <span class="text-[10px] sm:text-xs font-bold drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] opacity-90 group-hover/btn:opacity-100">
              Episode {{ nextEpisode.episodeNumber }}
            </span>
          </NuxtLink>
        </div>

        <!-- ===== BOTTOM CONTROL BAR ===== -->
        <div
          class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent px-3 sm:px-5 pb-3 sm:pb-4 pt-14 flex flex-col gap-2 transition-opacity duration-300 z-10"
          :class="(showControls || !isPlaying) && selectedVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'"
        >
          <!-- Red Progress bar -->
          <input
            type="range"
            min="0"
            :max="duration || 100"
            :value="currentTime"
            @input="currentTime = $event.target.value; seekVideo()"
            class="player-slider w-full"
            :style="{ background: `linear-gradient(to right, #ff2a2a ${progressPercent}%, rgba(255,255,255,0.2) ${progressPercent}%)` }"
          />

          <!-- Bottom Row Controls -->
          <div class="flex items-center justify-between text-white/90">
            <!-- Left: Time Display -->
            <div class="flex items-center gap-3">
              <span class="text-xs sm:text-sm font-semibold tabular-nums text-white/90 drop-shadow">
                {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
              </span>
            </div>

            <!-- Right Controls: Autonext, Quality, Speed, Fullscreen -->
            <div class="flex items-center gap-2 sm:gap-3">

              <!-- Autonext Toggle -->
              <button
                @click="autoNext = !autoNext"
                class="text-[10px] sm:text-xs font-extrabold px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 active:scale-95"
                :class="autoNext ? 'bg-[var(--accent)] text-white shadow-md shadow-[var(--accent-glow)]' : 'bg-white/10 text-white/50 hover:bg-white/15'"
                title="Autonext Episode"
              >
                <svg class="w-3 h-3 fill-current" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
                <span>Autonext</span>
              </button>

              <!-- Quality dropdown -->
              <div class="relative" v-if="availableQualities.length > 0">
                <button
                  @click="showQualityMenu = !showQualityMenu"
                  class="text-[10px] sm:text-xs font-bold px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors uppercase flex items-center gap-1"
                >
                  {{ selectedQuality }}
                  <svg class="w-3 h-3 opacity-60" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd"/></svg>
                </button>
                <!-- Menu -->
                <div v-if="showQualityMenu" class="absolute bottom-10 right-0 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl overflow-hidden z-20 min-w-[100px] shadow-2xl shadow-black/80 anim-scale-in">
                  <button
                    v-for="q in availableQualities"
                    :key="q"
                    @click="playResolution(q, 0)"
                    class="w-full text-left px-4 py-2.5 text-xs uppercase transition-colors font-semibold"
                    :class="selectedQuality === q ? 'bg-[var(--accent)]/20 text-[var(--accent)] font-bold' : 'text-[var(--text-secondary)] hover:bg-white/5 hover:text-white'"
                  >{{ q }}</button>
                </div>
              </div>

              <!-- Playback Speed -->
              <button @click="toggleSpeed" class="text-[10px] sm:text-xs font-bold px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
                {{ playbackSpeed }}x
              </button>

              <!-- Fullscreen -->
              <button @click="toggleFullscreen" class="hover:text-white transition-colors p-1" title="Fullscreen">
                <svg v-if="isFullscreen" class="w-4 h-4 sm:w-5 sm:h-5 fill-none stroke-current stroke-2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 9L4 4m0 0l5 0M4 4l0 5m11-5l5 5m0-5l-5 0m0 0l0 5M9 15l-5 5m0 0l5 0m-5 0l0-5m11 5l5-5m0 5l-5 0m0 0l0-5"/></svg>
                <svg v-else class="w-4 h-4 sm:w-5 sm:h-5 fill-none stroke-current stroke-2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>



      <!-- ===== INFO BAR ===== -->
      <div class="mt-5 pb-5 border-b border-[var(--border-subtle)] anim-fade-up anim-delay-2">
        <div class="flex items-start gap-4">
          <!-- Cover thumbnail -->
          <div v-if="parentAnime" class="hidden sm:block w-12 h-16 rounded-lg overflow-hidden shrink-0 bg-[var(--bg-card)] border border-[var(--border-subtle)]">
            <img :src="parentAnime.cover" class="w-full h-full object-cover" />
          </div>
          <div class="min-w-0 flex-1">
            <h2 v-if="parentAnime" class="text-base sm:text-lg font-bold text-white truncate">
              {{ parentAnime.title.replace('Nonton Anime ', '').replace('Sub Indo', '').trim() }}
            </h2>
            <p v-if="currentEpisodeNumber" class="text-xs text-[var(--accent)] mt-1 font-semibold">
              Episode {{ currentEpisodeNumber }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== EPISODE LIST ===== -->
    <div class="max-w-7xl mx-auto px-4 sm:px-6 pb-12 mt-2">
      <div v-if="parentAnime" class="space-y-4 anim-fade-up anim-delay-3">
        <div class="flex items-center gap-3">
          <div class="w-1 h-5 rounded-full bg-gradient-to-b from-[var(--accent)] to-purple-600"></div>
          <h3 class="text-sm font-bold text-white">Episode Lainnya</h3>
          <span class="text-[10px] text-[var(--text-muted)] font-medium">{{ parentAnime.episodes?.length || 0 }} eps</span>
        </div>
        <!-- Episode Box Grid (Matching Image #2 with top progress bar) -->
        <div class="flex flex-wrap gap-2.5">
          <NuxtLink
            v-for="ep in parentAnime.episodes"
            :key="ep.slug"
            :to="`/episode/${ep.slug}`"
            class="relative overflow-hidden flex items-center justify-center w-11 h-11 sm:w-13 sm:h-13 rounded-2xl text-xs sm:text-sm font-extrabold transition-all duration-200 active:scale-95 shadow-md border"
            :class="epSlug === ep.slug
              ? 'bg-white text-black font-black scale-105 shadow-xl shadow-white/20 border-white'
              : 'border-[var(--border-subtle)] bg-[var(--bg-card)]/80 text-[var(--text-secondary)] hover:text-white hover:border-white/30'"
          >
            <!-- Episode Number -->
            <span class="z-10">{{ ep.episodeNumber }}</span>

            <!-- Top Red Progress Line (Matching Image #2 progress) -->
            <div
              v-if="getEpisodeProgress(parentAnime?.slug || '', ep.slug)"
              class="absolute top-0 inset-x-0 h-1 bg-white/10 overflow-hidden rounded-t-2xl z-0"
            >
              <div
                class="h-full bg-red-500 transition-all"
                :style="{ width: `${getEpisodeProgress(parentAnime?.slug || '', ep.slug)?.duration ? Math.min(100, (getEpisodeProgress(parentAnime?.slug || '', ep.slug).lastTime / getEpisodeProgress(parentAnime?.slug || '', ep.slug).duration) * 100) : 0}%` }"
              ></div>
            </div>
          </NuxtLink>
        </div>
      </div>

      <!-- Loading episodes -->
      <div v-else-if="isResolving" class="flex items-center gap-2 mt-4">
        <div class="w-4 h-4 rounded-full border-2 border-[var(--border-subtle)] border-t-[var(--accent)] animate-spin"></div>
        <span class="text-xs text-[var(--text-muted)]">Memuat daftar episode...</span>
      </div>
    </div>

  </div>
</template>
