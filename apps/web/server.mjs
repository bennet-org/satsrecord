// Wrap the adapter's own server so static files and error responses receive headers too.
// Keep Astro's server, TLS configuration and request handling intact.
import { securityHeaders } from "./security-headers.mjs";

process.env.ASTRO_NODE_AUTOSTART = "disabled";
const { startServer } = await import("./dist/server/entry.mjs");
const { server } = startServer();
server.server.prependListener("request", (_request, response) => {
  for (const [name, value] of Object.entries(securityHeaders))
    response.setHeader(name, value);
});
