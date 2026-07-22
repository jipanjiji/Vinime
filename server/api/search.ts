import { defineEventHandler, getQuery } from 'h3'
import * as cheerio from 'cheerio'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = (query.q || '').toString().trim()

  if (!q) {
    return {
      success: true,
      results: []
    }
  }

  try {
    const targetUrl = `https://kuronime.sbs/?s=${encodeURIComponent(q)}`
    console.log(`[Search Engine] Searching Kuronime: ${targetUrl}`)

    const html = await $fetch<string>(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    })
    const $ = cheerio.load(html)

    const results: Array<{
      title: string
      slug: string
      cover: string
      score: string
      type: string
      status: string
      synopsis: string
      genres: string[]
    }> = []

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
            // Nonton link
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

    return {
      success: true,
      results
    }
  } catch (error: any) {
    return {
      success: false,
      message: `Search failed: ${error.message}`,
      results: []
    }
  }
})
