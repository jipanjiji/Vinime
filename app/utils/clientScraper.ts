import * as cheerio from 'cheerio'

const CHROME_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8'
}

export async function resolveClientVideoUrl(url: string) {
  if (!url) return null

  // 1. Pixeldrain direct API stream link (1080p, 720p, 480p, 360p)
  if (url.includes('pixeldrain.com')) {
    const match = url.match(/pixeldrain\.com\/(?:u|file|api\/file)\/([a-zA-Z0-9]+)/)
    if (match) {
      const fileId = match[1]
      return {
        rawVideoUrl: `https://pixeldrain.com/api/file/${fileId}?download`,
        isHls: false
      }
    }
  }

  // 2. Direct MP4 / HLS streams
  if (url.endsWith('.mp4') || url.includes('.m3u8') || url.includes('wibufile.com') || url.includes('googlevideo.com') || url.includes('blogspot.com') || url.includes('filedon.co')) {
    return {
      rawVideoUrl: url,
      isHls: url.includes('.m3u8')
    }
  }

  // 3. Krakenfiles direct resolver
  if (url.includes('krakenfiles.com')) {
    try {
      const res = await fetch(url, { headers: CHROME_HEADERS })
      if (res.ok) {
        const html = await res.text()
        const $ = cheerio.load(html)
        const videoSrc = $('video source').attr('src') || $('video#my-video source').attr('src') || $('a[href*="/download/"]').attr('href')
        if (videoSrc) {
          const directUrl = videoSrc.startsWith('http') ? videoSrc : `https:${videoSrc}`
          return { rawVideoUrl: directUrl, isHls: false }
        }
      }
    } catch {}
  }

  return null
}

export async function fetchClientHomeFeed() {
  try {
    const res = await fetch('https://kuronime.sbs/', { headers: CHROME_HEADERS })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()
    const $ = cheerio.load(html)

    const recentReleases: Array<any> = []
    $('article.bsu').each((_, el) => {
      const linkEl = $(el).find('a').first()
      const href = linkEl.attr('href') || ''
      const title = $(el).find('.bsuxtt h2').text().trim() || linkEl.attr('title')?.replace(/\s*subtitle\s*indonesia/i, '').trim() || 'Anime'
      const cover = $(el).find('img[itemprop="image"]').attr('src') ||
                    $(el).find('img:not(.dashicons-controls-play)').first().attr('src') || ''
      const episodeNumber = $(el).find('.ep').text().trim().replace(/Episode\s+/i, '')
      const releasedTime = $(el).find('.time').text().trim()

      if (href) {
        try {
          const parsedUrl = new URL(href)
          const episodeSlug = parsedUrl.pathname.replace(/^\/|\/$/g, '')
          const animeSlug = episodeSlug
            .replace(/^nonton-/, '')
            .replace(/-episode-\d+.*$/, '')
            .replace(/-eps-\d+.*$/, '')

          const portraitCover = cover ? cover.replace(/\?resize=\d+,\d+/, '?resize=220,310') : ''

          recentReleases.push({
            title,
            animeSlug,
            episodeSlug,
            episodeNumber,
            cover: portraitCover,
            postedBy: 'Kuronime',
            releasedTime
          })
        } catch {}
      }
    })

    const popularAnime: Array<any> = []
    $('.wpop-weekly li, .wpop li, .serieslist.pop li').each((_, el) => {
      const seriesLink = $(el).find('h2 a.series').first()
      const href = seriesLink.attr('href') || $(el).find('a.series').first().attr('href') || ''
      const title = seriesLink.text().trim() || $(el).find('h2').text().trim() || $(el).find('img').attr('alt') || 'Popular Anime'
      const cover = $(el).find('img[itemprop="image"]').attr('src') ||
                    $(el).find('img:not(.dashicons-controls-play)').first().attr('src') || ''

      const genres: string[] = []
      $(el).find('.leftseries span a[href*="/genres/"]').each((__, aEl) => {
        genres.push($(aEl).text().trim())
      })

      let releasedDate = ''
      const textSpans = $(el).find('.leftseries span')
      textSpans.each((idx, spanEl) => {
        const text = $(spanEl).text().trim()
        if (text && !text.includes('Genres')) {
          releasedDate = text
        }
      })

      if (href && title) {
        try {
          const parsedUrl = new URL(href)
          const slug = parsedUrl.pathname.replace(/^\/anime\//, '').replace(/\/$/, '')
          popularAnime.push({
            title,
            slug,
            cover,
            genres,
            releasedDate
          })
        } catch {}
      }
    })

    const uniquePopular = Array.from(new Map(popularAnime.map(item => [item.slug, item])).values()).slice(0, 10)

    if (recentReleases.length > 0) {
      return { success: true, recentReleases, popularAnime: uniquePopular }
    }
  } catch (err) {
    console.warn('[Client Scraper] Kuronime home failed:', err)
  }

  // Fallback to Otakudesu if Kuronime fails
  try {
    const res = await fetch('https://otakudesu.cloud/', { headers: CHROME_HEADERS })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()
    const $ = cheerio.load(html)

    const recentReleases: Array<any> = []
    $('.venetz .detpost').each((_, el) => {
      const title = $(el).find('.j2ttl').text().trim()
      const href = $(el).find('a').first().attr('href') || ''
      const episodeNumber = $(el).find('.epz').text().trim().replace(/Episode\s*/i, '')
      const cover = $(el).find('img').attr('src') || ''
      const releasedTime = $(el).find('.newep').text().trim()

      if (href) {
        try {
          const parsedUrl = new URL(href)
          const episodeSlug = parsedUrl.pathname.replace(/^\/episode\/|\/$/g, '')
          const animeSlug = episodeSlug.replace(/-episode-\d+.*$/, '')

          recentReleases.push({
            title,
            animeSlug,
            episodeSlug,
            episodeNumber,
            cover,
            postedBy: 'Otakudesu',
            releasedTime
          })
        } catch {}
      }
    })

    return { success: true, recentReleases, popularAnime: [] }
  } catch (err) {
    console.warn('[Client Scraper] Otakudesu home failed:', err)
    return { success: false, recentReleases: [], popularAnime: [] }
  }
}

export async function fetchClientAnimeDetail(slug: string) {
  const targetUrl = `https://kuronime.sbs/anime/${slug}/`
  try {
    const res = await fetch(targetUrl, { headers: CHROME_HEADERS })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()
    const $ = cheerio.load(html)

    const title = $('.entry-title').text().trim() || $('h1.entry-title').text().trim() || 'Anime Detail'
    const cover = $('.entry-content .main-info .con .l img').attr('src') ||
                  $('img[itemprop="image"]').attr('src') || ''
    const synopsis = $('.sinopsis p, .entry-content p, .desc p').first().text().trim() ||
                     $('.sinopsis, .entry-content, .desc').text().trim() || ''

    let alternativeTitle = ''
    let type = 'TV'
    let status = 'Unknown'
    let studio = 'Unknown'
    let season = 'Unknown'
    let episodesCount = '1'
    let released = 'Unknown'
    const genres: string[] = []

    $('.entry-content .infodetail ul li').each((_, el) => {
      const text = $(el).text().trim()
      if (text.startsWith('Judul:')) {
        alternativeTitle = text.replace('Judul:', '').trim()
      } else if (text.startsWith('Genre:')) {
        $(el).find('a').each((__, a) => {
          genres.push($(a).text().trim())
        })
      } else if (text.startsWith('Status:')) {
        status = text.replace('Status:', '').trim()
      } else if (text.startsWith('Studio:')) {
        studio = $(el).find('a').text().trim() || text.replace('Studio:', '').trim()
      } else if (text.startsWith('Season:')) {
        season = $(el).find('a').text().trim() || text.replace('Season:', '').trim()
      } else if (text.startsWith('Tipe:')) {
        type = text.replace('Tipe:', '').trim()
      } else if (text.startsWith('Jumlah Episode:')) {
        episodesCount = text.replace('Jumlah Episode:', '').trim()
      } else if (text.startsWith('Tayang:') || text.startsWith('Released on:')) {
        released = text.replace(/Tayang:|Released on:/, '').trim()
      }
    })

    const episodesList: Array<{ title: string; slug: string; episodeNumber: string }> = []
    $('.bixbox.bxcl ul li').each((_, el) => {
      const epLabel = $(el).find('.lchx a').text().trim()
      const epHref = $(el).find('.lchx a').attr('href') || ''
      let episodeNumber = '1'
      const numMatch = epLabel.match(/(\d+(?:\.\d+)?)/)
      if (numMatch) episodeNumber = numMatch[1]

      if (epHref) {
        try {
          const parsedUrl = new URL(epHref)
          const epSlug = parsedUrl.pathname.replace(/^\/|\/$/g, '')
          episodesList.push({ title: epLabel, slug: epSlug, episodeNumber })
        } catch {}
      }
    })

    const rawScore = $('.numscore').first().text().trim() || $('.rating .num').first().text().trim() || $('.rating').first().text().trim() || ''
    const scoreMatch = rawScore.match(/(\d+\.?\d*)/)
    const score = scoreMatch ? scoreMatch[1] : '0.0'

    episodesList.reverse()

    return {
      success: true,
      title,
      slug,
      cover,
      synopsis,
      score,
      alternativeTitle,
      type,
      status,
      studio,
      season,
      episodesCount,
      released,
      genres,
      episodes: episodesList
    }
  } catch (err: any) {
    console.warn('[Client Scraper] Anime detail failed:', err)
    return { success: false, episodes: [] }
  }
}

export async function fetchClientSearch(q: string) {
  const targetUrl = `https://kuronime.sbs/?s=${encodeURIComponent(q)}`
  try {
    const res = await fetch(targetUrl, { headers: CHROME_HEADERS })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()
    const $ = cheerio.load(html)

    const results: Array<any> = []
    $('.listupd article, .listupd .bs, .search-page article').each((_, el) => {
      const linkEl = $(el).find('a').first()
      const href = linkEl.attr('href') || ''
      const title = $(el).find('.bsuxtt h2').text().trim() || $(el).find('h2').text().trim() || linkEl.attr('title')?.replace(/\s*subtitle\s*indonesia/i, '').trim() || 'Anime'
      const cover = $(el).find('img[itemprop="image"]').attr('src') ||
                    $(el).find('img:not(.dashicons-controls-play)').first().attr('src') || ''
      const scoreVal = $(el).find('.rating i').text().trim() || $(el).find('.numscore').text().trim() || ''
      const scoreMatch = scoreVal.match(/(\d+\.?\d*)/)
      const score = scoreMatch ? scoreMatch[1] : '0.0'
      const type = $(el).find('.typez').text().trim() || 'TV'
      const status = $(el).find('.ep').text().trim() || ''
      const synopsis = $(el).find('.entry-content p, .sinopsis p').text().trim() || ''

      if (href) {
        try {
          const parsedUrl = new URL(href)
          let slug = ''
          if (parsedUrl.pathname.startsWith('/anime/')) {
            slug = parsedUrl.pathname.replace(/^\/anime\//, '').replace(/\/$/, '')
          } else {
            slug = parsedUrl.pathname
              .replace(/^\/|\/$/g, '')
              .replace(/^nonton-/, '')
              .replace(/-episode-\d+.*$/, '')
              .replace(/-eps-\d+.*$/, '')
          }

          if (slug) {
            results.push({
              title,
              slug,
              cover,
              score,
              type,
              status,
              synopsis,
              genres: []
            })
          }
        } catch {}
      }
    })

    return { success: true, results }
  } catch (err: any) {
    console.warn('[Client Scraper] Search failed:', err)
    return { success: false, results: [] }
  }
}

export async function fetchClientGenres(genreSlug?: string) {
  if (genreSlug) {
    const targetUrl = `https://kuronime.sbs/genres/${genreSlug}/`
    try {
      const res = await fetch(targetUrl, { headers: CHROME_HEADERS })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const html = await res.text()
      const $ = cheerio.load(html)

      const animeList: Array<any> = []
      $('.listupd article, .listupd .bs').each((_, el) => {
        const title = $(el).find('h2, h3, .title').text().trim()
        const href = $(el).find('a').first().attr('href') || ''
        const cover = $(el).find('img[itemprop="image"]').attr('src') ||
                      $(el).find('img:not(.dashicons-controls-play)').first().attr('src') || ''
        const type = $(el).find('.typez').text().trim() || 'TV'
        const ratingRaw = $(el).find('.numscore').text().trim() || $(el).find('.rating .num').text().trim() || ''
        const ratingMatch = ratingRaw.match(/(\d+\.?\d*)/)
        const rating = ratingMatch ? ratingMatch[1] : '0.0'

        if (href && title) {
          try {
            const parsedUrl = new URL(href)
            const slug = parsedUrl.pathname.replace(/^\/anime\//, '').replace(/\/$/, '')
            animeList.push({ title, slug, cover, type, rating })
          } catch {}
        }
      })

      const genreTitle = $('title').text().replace(' - Kuronime', '').trim()

      return { success: true, genreName: genreTitle, animeList }
    } catch (err: any) {
      console.warn('[Client Scraper] Genre item failed:', err)
      return { success: false, animeList: [] }
    }
  } else {
    const targetUrl = 'https://kuronime.sbs/genres/'
    try {
      const res = await fetch(targetUrl, { headers: CHROME_HEADERS })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const html = await res.text()
      const $ = cheerio.load(html)

      const genresList: Array<{ name: string; slug: string }> = []
      const seenSlugs = new Set<string>()

      $('ul.genres a, .genreslist a, .tagcloud a, a[href*="/genres/"]').each((_, el) => {
        const name = $(el).text().trim()
        const href = $(el).attr('href') || ''

        if (href && name && name.toLowerCase() !== 'genres') {
          try {
            const parsedUrl = new URL(href)
            const slug = parsedUrl.pathname.replace(/^\/genres\//, '').replace(/\/$/, '')
            if (slug && !seenSlugs.has(slug)) {
              seenSlugs.add(slug)
              genresList.push({ name, slug })
            }
          } catch {}
        }
      })

      genresList.sort((a, b) => a.name.localeCompare(b.name))

      return { success: true, genres: genresList }
    } catch (err: any) {
      console.warn('[Client Scraper] Genres list failed:', err)
      return { success: false, genres: [] }
    }
  }
}

export async function fetchClientEpisode(epSlug: string) {
  const videoSources: Array<{ label: string; url: string; quality: string; isIframe?: boolean }> = []
  const cleanSlug = epSlug.replace(/^nonton-/, '').replace(/\/$/, '')

  // 1. Direct raw downloads & streams from Otakudesu
  const otakuUrls = [
    `https://otakudesu.cloud/episode/${cleanSlug}/`,
    `https://otakudesu.cloud/episode/${cleanSlug}-sub-indo/`,
    `https://otakudesu.blog/episode/${cleanSlug}/`
  ]

  for (const otUrl of otakuUrls) {
    try {
      const res = await fetch(otUrl, { headers: CHROME_HEADERS })
      if (!res.ok) continue
      const html = await res.text()
      const $ep = cheerio.load(html)

      $ep('.download ul li').each((_, el) => {
        let quality = '720p'
        const headerText = $ep(el).find('h4, strong').text().trim()
        const qualityMatch = headerText.match(/(\d+p|4k)/i)
        if (qualityMatch) quality = qualityMatch[1].toLowerCase()

        $ep(el).find('a').each((__, aEl) => {
          const href = $ep(aEl).attr('href') || ''
          const label = $ep(aEl).text().trim()
          if (href && (href.includes('pixeldrain.com') || href.includes('krakenfiles.com') || href.includes('gofile.io') || href.includes('acefile.co'))) {
            let mirrorName = label || 'Pixeldrain'
            if (href.includes('pixeldrain.com')) mirrorName = 'Pixeldrain'
            else if (href.includes('krakenfiles.com')) mirrorName = 'Krakenfiles'
            else if (href.includes('gofile.io')) mirrorName = 'Gofile'

            videoSources.push({
              label: `[Otakudesu Direct] ${mirrorName} (${quality})`,
              url: href,
              quality
            })
          }
        })
      })

      if (videoSources.length > 0) break
    } catch (err) {
      console.warn('[Client Scraper] Otakudesu episode error:', err)
    }
  }

  // 2. Direct raw streams from Kuronime
  const kuronimeUrls = [
    `https://kuronime.sbs/${cleanSlug}/`,
    `https://kuronime.sbs/nonton-${cleanSlug}/`
  ]

  for (const kUrl of kuronimeUrls) {
    try {
      const res = await fetch(kUrl, { headers: CHROME_HEADERS })
      if (!res.ok) continue
      const html = await res.text()
      const $ep = cheerio.load(html)

      $ep('a').each((_, el) => {
        const href = $ep(el).attr('href') || ''
        if (!href) return
        const parentText = ($ep(el).parents().text() + ' ' + $ep(el).text()).toLowerCase()
        let quality = '720p'
        if (parentText.includes('1080')) quality = '1080p'
        else if (parentText.includes('480')) quality = '480p'
        else if (parentText.includes('360')) quality = '360p'

        if (href.includes('pixeldrain.com') || href.includes('krakenfiles.com') || href.includes('gofile.io') || href.includes('acefile.co')) {
          let mirror = 'Pixeldrain'
          if (href.includes('pixeldrain.com')) mirror = 'Pixeldrain'
          else if (href.includes('krakenfiles.com')) mirror = 'Krakenfiles'

          if (!videoSources.some(v => v.url === href)) {
            videoSources.push({
              label: `[Kuronime Direct] ${mirror} (${quality})`,
              url: href,
              quality
            })
          }
        }
      })

      // Try animeku.org direct download links
      let hashVal = ''
      $ep('script').each((_, el) => {
        const content = $ep(el).html() || ''
        const matchHash = content.match(/var\s+_0xa100d42aa\s*=\s*["']([^"']+)["']/i)
        if (matchHash) {
          hashVal = matchHash[1]
          return false
        }
      })

      if (hashVal) {
        const apiRes = await fetch('https://animeku.org/api/v9/sources', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Referer': kUrl,
            'Origin': 'https://kuronime.sbs'
          },
          body: JSON.stringify({ id: hashVal })
        }).catch(() => null)

        if (apiRes?.ok) {
          const json = await apiRes.json().catch(() => null)
          if (json?.status === 200 && json.mirror) {
            const { default: CryptoJS } = await import('crypto-js')
            const CryptoJSAesJson = {
              parse: function(jsonStr: string) {
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

             // Extract embeds
             const embed = decryptedData.embed || {}
             for (const quality in embed) {
               const servers = embed[quality]
               const cleanQ = quality.replace(/^v/, '')
               for (const serverName in servers) {
                 const url = servers[serverName]
                 if (url) {
                   const isEmbedIframe = !url.includes('pixeldrain.com') && !url.includes('krakenfiles.com') && !url.includes('gofile.io')
                   videoSources.push({
                     label: `[Kuronime] ${serverName} (${cleanQ})`,
                     url,
                     quality: cleanQ,
                     isIframe: isEmbedIframe
                   })
                 }
               }
             }

            const download = decryptedData.download || {}
            for (const quality in download) {
              const mirrors = download[quality]
              const cleanQ = quality.replace(/^v/, '')
              for (const mirrorName in mirrors) {
                const url = mirrors[mirrorName]
                if (url && (url.includes('pixeldrain.com') || url.includes('krakenfiles.com') || url.includes('gofile.io'))) {
                  if (!videoSources.some(s => s.url === url)) {
                    videoSources.push({ label: `[Kuronime Direct] ${mirrorName} (${cleanQ})`, url, quality: cleanQ })
                  }
                }
              }
            }
          }
        }
      }

      if (videoSources.length > 0) break
    } catch (err) {
      console.warn('[Client Scraper] Kuronime episode error:', err)
    }
  }

  // 3. Direct raw streams and player options from Samehadaku
  if (videoSources.length === 0) {
    const samehadakuUrls = [
      `https://v2.samehadaku.how/${cleanSlug}/`,
      `https://v2.samehadaku.how/${cleanSlug}-sub-indo/`
    ]

    for (const shUrl of samehadakuUrls) {
      try {
        const res = await fetch(shUrl, { headers: CHROME_HEADERS })
        if (!res.ok) continue
        const html = await res.text()
        const $ep = cheerio.load(html)

        // A. Extract player options
        const options: Array<{ label: string; post: string; nume: string; type: string }> = []
        $ep('.east_player_option').each((_, el) => {
          const label = $ep(el).text().trim()
          const post = $ep(el).attr('data-post')
          const nume = $ep(el).attr('data-nume')
          const type = $ep(el).attr('data-type')
          if (post && nume && type) {
            options.push({ label, post, nume, type })
          }
        })

        const parsedOrigin = new URL(shUrl).origin
        const ajaxUrl = `${parsedOrigin}/wp-admin/admin-ajax.php`

        await Promise.all(
          options.map(async (opt) => {
            try {
              const payload = new URLSearchParams()
              payload.append('action', 'player_ajax')
              payload.append('post', opt.post)
              payload.append('nume', opt.nume)
              payload.append('type', opt.type)

              const ajaxRes = await fetch(ajaxUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                  'Referer': shUrl,
                  'X-Requested-With': 'XMLHttpRequest',
                  ...CHROME_HEADERS
                },
                body: payload.toString()
              })

              if (ajaxRes.ok) {
                const ajaxResponse = await ajaxRes.text()
                let iframeSrc: string | null = null

                const shortcodeMatch = ajaxResponse.match(/\[(\w+)\s+id=["']?([a-zA-Z0-9_-]+)["']?\]/)
                if (shortcodeMatch) {
                  const codeName = shortcodeMatch[1].toLowerCase()
                  const codeId = shortcodeMatch[2]
                  if (codeName === 'vidlion' || codeName === 'vidhide') {
                    iframeSrc = `https://vidhidepro.com/v/${codeId}`
                  }
                } else {
                  const $iframe = cheerio.load(ajaxResponse)
                  iframeSrc = $iframe('iframe').attr('src') || null
                }

                if (iframeSrc) {
                  let quality = 'unknown'
                  const qualityMatch = opt.label.match(/(\d+p|4k)/i)
                  if (qualityMatch) quality = qualityMatch[1].toLowerCase()

                  const serverName = opt.label.replace(/\s*(\d+p|4k)/i, '').trim()
                  const isEmbedIframe = !iframeSrc.includes('wibufile') && !iframeSrc.includes('pixeldrain') && !iframeSrc.includes('krakenfiles') && !iframeSrc.includes('gofile')

                  videoSources.push({
                    label: `[Samehadaku] ${serverName} (${quality})`,
                    url: iframeSrc,
                    quality,
                    isIframe: isEmbedIframe
                  })
                }
              }
            } catch (err) {
              console.warn('[Client Scraper] Samehadaku ajax error:', err)
            }
          })
        )

        // B. Extract download links
        $ep('.download-link ul li, .download-eps li, .sda_download li').each((_, el) => {
          let quality = 'unknown'
          const strongText = $ep(el).find('strong').text().trim()
          const qualityMatch = strongText.match(/(\d+p|4k)/i)
          if (qualityMatch) {
            quality = qualityMatch[1].toLowerCase()
          }

          $ep(el).find('a').each((__, aEl) => {
            const href = $ep(aEl).attr('href') || ''
            const label = $ep(aEl).text().trim()
            
            if (href && (href.includes('krakenfiles.com') || href.includes('pixeldrain.com') || href.includes('gofile.io') || href.includes('acefile.co') || href.includes('wibufile'))) {
              let mirrorName = label || 'Download Mirror'
              if (href.includes('krakenfiles.com')) mirrorName = 'Krakenfiles'
              else if (href.includes('pixeldrain.com')) mirrorName = 'Pixeldrain'
              else if (href.includes('gofile.io')) mirrorName = 'Gofile'
              else if (href.includes('acefile.co')) mirrorName = 'Acefile'
              else if (href.includes('wibufile')) mirrorName = 'Wibufile'

              if (!videoSources.some(v => v.url === href)) {
                videoSources.push({
                  label: `[Samehadaku Direct] ${mirrorName} (${quality})`,
                  url: href,
                  quality
                })
              }
            }
          })
        })

        if (videoSources.length > 0) break
      } catch (err) {
        console.warn('[Client Scraper] Samehadaku episode error:', err)
      }
    }
  }

  const uniqueVideos = Array.from(new Map(videoSources.map(item => [item.url, item])).values())

  return {
    success: uniqueVideos.length > 0,
    videoSources: uniqueVideos
  }
}

export async function scrapeSamehadakuClient(targetUrl: string) {
  try {
    const res = await fetch(targetUrl, { headers: CHROME_HEADERS })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()
    const $ep = cheerio.load(html)

    const videoSources: Array<{ label: string; url: string; quality: string; isIframe?: boolean }> = []

    // A. Extract player options
    const options: Array<{ label: string; post: string; nume: string; type: string }> = []
    $ep('.east_player_option').each((_, el) => {
      const label = $ep(el).text().trim()
      const post = $ep(el).attr('data-post')
      const nume = $ep(el).attr('data-nume')
      const type = $ep(el).attr('data-type')
      if (post && nume && type) {
        options.push({ label, post, nume, type })
      }
    })

    const parsedOrigin = new URL(targetUrl).origin
    const ajaxUrl = `${parsedOrigin}/wp-admin/admin-ajax.php`

    await Promise.all(
      options.map(async (opt) => {
        try {
          const payload = new URLSearchParams()
          payload.append('action', 'player_ajax')
          payload.append('post', opt.post)
          payload.append('nume', opt.nume)
          payload.append('type', opt.type)

          const ajaxRes = await fetch(ajaxUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Referer': targetUrl,
              'X-Requested-With': 'XMLHttpRequest',
              ...CHROME_HEADERS
            },
            body: payload.toString()
          })

          if (ajaxRes.ok) {
            const ajaxResponse = await ajaxRes.text()
            let iframeSrc: string | null = null

            const shortcodeMatch = ajaxResponse.match(/\[(\w+)\s+id=["']?([a-zA-Z0-9_-]+)["']?\]/)
            if (shortcodeMatch) {
              const codeName = shortcodeMatch[1].toLowerCase()
              const codeId = shortcodeMatch[2]
              if (codeName === 'vidlion' || codeName === 'vidhide') {
                iframeSrc = `https://vidhidepro.com/v/${codeId}`
              }
            } else {
              const $iframe = cheerio.load(ajaxResponse)
              iframeSrc = $iframe('iframe').attr('src') || null
            }

            if (iframeSrc) {
              let quality = 'unknown'
              const qualityMatch = opt.label.match(/(\d+p|4k)/i)
              if (qualityMatch) quality = qualityMatch[1].toLowerCase()

              const serverName = opt.label.replace(/\s*(\d+p|4k)/i, '').trim()
              const isEmbedIframe = !iframeSrc.includes('wibufile') && !iframeSrc.includes('pixeldrain') && !iframeSrc.includes('krakenfiles') && !iframeSrc.includes('gofile')

              videoSources.push({
                label: `[Samehadaku] ${serverName} (${quality})`,
                url: iframeSrc,
                quality,
                isIframe: isEmbedIframe
              })
            }
          }
        } catch (err) {
          console.warn('[Client Scraper] Samehadaku ajax error:', err)
        }
      })
    )

    // B. Extract download links
    $ep('.download-link ul li, .download-eps li, .sda_download li').each((_, el) => {
      let quality = 'unknown'
      const strongText = $ep(el).find('strong').text().trim()
      const qualityMatch = strongText.match(/(\d+p|4k)/i)
      if (qualityMatch) {
        quality = qualityMatch[1].toLowerCase()
      }

      $ep(el).find('a').each((__, aEl) => {
        const href = $ep(aEl).attr('href') || ''
        const label = $ep(aEl).text().trim()
        
        if (href && (href.includes('krakenfiles.com') || href.includes('pixeldrain.com') || href.includes('gofile.io') || href.includes('acefile.co') || href.includes('wibufile'))) {
          let mirrorName = label || 'Download Mirror'
          if (href.includes('krakenfiles.com')) mirrorName = 'Krakenfiles'
          else if (href.includes('pixeldrain.com')) mirrorName = 'Pixeldrain'
          else if (href.includes('gofile.io')) mirrorName = 'Gofile'
          else if (href.includes('acefile.co')) mirrorName = 'Acefile'
          else if (href.includes('wibufile')) mirrorName = 'Wibufile'

          if (!videoSources.some(v => v.url === href)) {
            videoSources.push({
              label: `[Samehadaku Direct] ${mirrorName} (${quality})`,
              url: href,
              quality,
              isIframe: false
            })
          }
        }
      })
    })

    return { success: true, videoSources }
  } catch (err: any) {
    return { success: false, message: err.message }
  }
}
