import { defineEventHandler } from 'h3'
import * as cheerio from 'cheerio'

export default defineEventHandler(async (event) => {
  try {
    const targetUrl = 'https://kuronime.sbs/'
    console.log(`[Home Engine] Fetching Kuronime home feed: ${targetUrl}`)

    const html = await $fetch<string>(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    })
    const $ = cheerio.load(html)

    // 1. Parse Recently Updated Episodes
    const recentReleases: Array<{
      title: string
      animeSlug: string
      episodeSlug: string
      episodeNumber: string
      cover: string
      postedBy: string
      releasedTime: string
    }> = []

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
          
          // Deduce anime slug from episode slug
          // e.g. "nonton-kuroneko-to-majo-no-kyoushitsu-episode-12" -> "kuroneko-to-majo-no-kyoushitsu"
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

    // 2. Parse Popular Anime Widget (Top 10 Weekly)
    const popularAnime: Array<{
      title: string
      slug: string
      cover: string
      genres: string[]
      releasedDate: string
    }> = []

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

    const uniquePopular = Array.from(new Map(popularAnime.map(item => [item.slug, item])).values())
      .slice(0, 10)

    return {
      success: true,
      recentReleases,
      popularAnime: uniquePopular
    }
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to load Kuronime home feed: ${error.message}`,
      recentReleases: [],
      popularAnime: []
    }
  }
})
