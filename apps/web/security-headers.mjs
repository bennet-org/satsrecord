// Used by Astro middleware and the Node listener (which also serves static files).
export const securityHeaders = {
  "Content-Security-Policy": "frame-ancestors 'none'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Browsers ignore HSTS on HTTP. Sending it here also covers TLS-terminating proxies.
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
};
