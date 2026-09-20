import license from "@fontsource-variable/schibsted-grotesk/LICENSE?raw";
export function GET() {
  return new Response(license, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
