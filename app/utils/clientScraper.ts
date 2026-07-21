import * as cheerio from 'cheerio'

export async function fetchClientHomeFeed() {
  const CHROME_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8'
  }

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
