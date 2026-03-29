import type { APIRoute } from 'astro'

export const GET: APIRoute = ({ site }) => {
  const siteUrl = site?.origin || import.meta.env.SITE || 'https://inboil.app'
  return new Response(
    `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap-index.xml\n`,
    { headers: { 'Content-Type': 'text/plain' } },
  )
}
