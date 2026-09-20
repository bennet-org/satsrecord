import font from "@fontsource-variable/schibsted-grotesk/files/schibsted-grotesk-latin-wght-normal.woff2?inline";
// The brand face is hosted here so embeds never contact a third-party font service.
export function GET() {
  return new Response(
    Buffer.from(font.slice(font.indexOf(",") + 1), "base64"),
    {
      headers: {
        "Content-Type": "font/woff2",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400",
      },
    },
  );
}
