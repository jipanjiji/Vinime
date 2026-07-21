import * as cheerio from 'cheerio'

const CHROME_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8'
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

export async function fetchClientEpisode(epSlug: string) {
  const videoSources: Array<{ label: string; url: string; quality: string }> = []
  const cleanSlug = epSlug.replace(/^nonton-/, '').replace(/\/$/, '')

  // 1. Try Otakudesu Direct Client Scrape
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

      let scriptWithNonce = ''
      $ep('script').each((_, el) => {
        const content = $ep(el).html()
        if (content && content.includes('__x__nonce')) scriptWithNonce = content
      })

      if (scriptWithNonce) {
        const actionMatches = [...scriptWithNonce.matchAll(/action\s*:\s*["']([a-f0-9]{32})["']/g)]
        if (actionMatches.length >= 2) {
          const streamAction = actionMatches[0][1]
          const getNonceAction = actionMatches[1][1]

          const ajaxUrlMatch = scriptWithNonce.match(/\$\.ajax\(["'](https?:\/\/[^"']+admin-ajax\.php)["']/) ||
            scriptWithNonce.match(/["'](https?:\/\/[^"']+admin-ajax\.php)["']/)
          const ajaxUrl = ajaxUrlMatch ? ajaxUrlMatch[1] : 'https://otakudesu.blog/wp-admin/admin-ajax.php'

          const nonceBody = new URLSearchParams()
          nonceBody.append('action', getNonceAction)

          const nonceRes = await fetch(ajaxUrl, {
            method: 'POST',
            headers: {
              ...CHROME_HEADERS,
              'Referer': otUrl,
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-Requested-With': 'XMLHttpRequest'
            },
            body: nonceBody.toString()
          })

          if (nonceRes.ok) {
            const nonceJson = await nonceRes.json().catch(() => null)
            const nonce = nonceJson?.data
            if (nonce) {
              const mirrorElements: Array<{ label: string; dataContent: string; quality: string }> = []
              $ep('.mirrorstream a, .mirrorstream li a').each((_, el) => {
                const dataContent = $ep(el).attr('data-content')
                const label = $ep(el).text().trim()
                let quality = 'unknown'
                const parentUlClass = $ep(el).closest('ul').attr('class') || ''
                const qualityMatch = parentUlClass.match(/m(\d+p)/)
                if (qualityMatch) quality = qualityMatch[1]

                if (dataContent) mirrorElements.push({ label, dataContent, quality })
              })

              await Promise.all(
                mirrorElements.map(async (m) => {
                  try {
                    const decodedPayload = JSON.parse(atob(m.dataContent))
                    const streamBody = new URLSearchParams()
                    Object.keys(decodedPayload).forEach(key => {
                      streamBody.append(key, String(decodedPayload[key]))
                    })
                    streamBody.append('nonce', nonce)
                    streamBody.append('action', streamAction)

                    const streamRes = await fetch(ajaxUrl, {
                      method: 'POST',
                      headers: {
                        ...CHROME_HEADERS,
                        'Referer': otUrl,
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'X-Requested-With': 'XMLHttpRequest'
                      },
                      body: streamBody.toString()
                    })

                    if (streamRes.ok) {
                      const streamJson = await streamRes.json().catch(() => null)
                      if (streamJson?.data) {
                        const playerHtml = atob(streamJson.data)
                        const $iframe = cheerio.load(playerHtml)
                        const iframeSrc = $iframe('iframe').attr('src')
                        if (iframeSrc) {
                          videoSources.push({
                            label: `[Otakudesu] ${m.label} (${m.quality})`,
                            url: iframeSrc,
                            quality: m.quality
                          })
                        }
                      }
                    }
                  } catch {}
                })
              )
            }
          }
        }
      }

      // Direct downloads from Otakudesu
      $ep('.download ul li').each((_, el) => {
        let quality = 'unknown'
        const headerText = $ep(el).find('h4, strong').text().trim()
        const qualityMatch = headerText.match(/(\d+p|4k)/i)
        if (qualityMatch) quality = qualityMatch[1].toLowerCase()

        $ep(el).find('a').each((__, aEl) => {
          const href = $ep(aEl).attr('href') || ''
          const label = $ep(aEl).text().trim()
          if (href && (href.includes('krakenfiles.com') || href.includes('pixeldrain.com') || href.includes('gofile.io') || href.includes('acefile.co'))) {
            let mirrorName = label || 'Download Mirror'
            if (href.includes('krakenfiles.com')) mirrorName = 'Krakenfiles'
            else if (href.includes('pixeldrain.com')) mirrorName = 'Pixeldrain'
            else if (href.includes('gofile.io')) mirrorName = 'Gofile'
            else if (href.includes('acefile.co')) mirrorName = 'Acefile'

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

  // 2. Try Kuronime Direct Client Scrape
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

      // Direct download links from HTML
      $ep('a').each((_, el) => {
        const href = $ep(el).attr('href') || ''
        if (!href) return
        const parentText = ($ep(el).parents().text() + ' ' + $ep(el).text()).toLowerCase()
        let quality = '720p'
        if (parentText.includes('1080')) quality = '1080p'
        else if (parentText.includes('480')) quality = '480p'
        else if (parentText.includes('360')) quality = '360p'

        if (href.includes('pixeldrain.com') || href.includes('krakenfiles.com') || href.includes('gofile.io') || href.includes('acefile.co')) {
          let mirror = 'Download'
          if (href.includes('pixeldrain.com')) mirror = 'Pixeldrain'
          else if (href.includes('krakenfiles.com')) mirror = 'Krakenfiles'
          else if (href.includes('gofile.io')) mirror = 'Gofile'
          else if (href.includes('acefile.co')) mirror = 'Acefile'

          if (!videoSources.some(v => v.url === href)) {
            videoSources.push({
              label: `[Kuronime Direct] ${mirror} (${quality})`,
              url: href,
              quality
            })
          }
        }
      })

      // Try animeku.org hash POST
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

            const embed = decryptedData.embed || {}
            for (const quality in embed) {
              const servers = embed[quality]
              const cleanQ = quality.replace(/^v/, '')
              for (const serverName in servers) {
                const url = servers[serverName]
                if (url && !videoSources.some(s => s.url === url)) {
                  videoSources.push({ label: `[Kuronime] ${serverName} (${cleanQ})`, url, quality: cleanQ })
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

  const uniqueVideos = Array.from(new Map(videoSources.map(item => [item.url, item])).values())

  return {
    success: uniqueVideos.length > 0,
    videoSources: uniqueVideos
  }
}
