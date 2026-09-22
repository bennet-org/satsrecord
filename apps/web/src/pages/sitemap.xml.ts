import type { APIRoute } from "astro";

export const prerender = true;

const paths = ["/", "/faq/", "/request-access/", "/privacy/", "/terms/"];

export const GET: APIRoute = ({ site }) => {
  const urls = paths
    .map((path) => `  <url><loc>${new URL(path, site).href}</loc></url>`)
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  });
};
