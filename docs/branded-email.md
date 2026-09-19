# Charity-branded email sending

Planned for **Phase 9**, where DNS delegation already sits. Keep it optional: the demo and initial hosted launch send as “Charity Name via SatsRecord”, with replies going to the charity. Bring this forward to Phase 8 only if a design partner needs it to launch. Phase 4 should describe the current sender accurately; it need not introduce domain-verification plumbing yet.

## Intended experience

An organisation admin chooses a From address such as `donations@charity.org`. Settings shows the exact DNS records to add, verification progress, and a test-send action. Once verified, donor address and acknowledgement emails use the charity's display name and From address. SatsRecord login and invitation emails retain SatsRecord's identity. Replies continue to use the configured reply-to mailbox.

The charity authorises sending through DNS. This does not move its existing mailboxes to SatsRecord. DKIM authenticates the sending domain; SPF and an MX record on a dedicated Return-Path subdomain support delivery and bounce handling. The charity's existing inbox MX records stay in place. Check DMARC alignment with its existing policy rather than replacing that policy. Resend supplies the exact record names, types and values.

Sources: [Resend domain verification](https://resend.com/changelog/domain-verification-events), [custom Return-Path](https://resend.com/changelog/custom-return-path), [domain webhooks](https://resend.com/changelog/new-domain-webhooks).

## Build scope

- Add an organisation-scoped sender identity: provider domain ID, verified domain, approved From address, verification status and timestamps. The existing display-name/reply-to fields are not a complete domain identity model.
- Integrate Resend domain creation, verification, status refresh and removal. Keep provider credentials server-side, restrict setup to admins, and bind each sending identity to its organisation. Resolve domains already registered with another Resend account through an explicit supported onboarding path.
- Add the DNS instructions, pending/verified/failed states and an explicit test-send action to settings. Allow standard SatsRecord sending while verification is pending.
- Extend sender selection in the existing Mailer flow. Use branded From addresses only when verified. If verification is lost, notify the admin and fall back to SatsRecord with the charity's reply-to; record which sender was actually used for each email.
- Verify webhook signatures, handle duplicate events, update domain status, and process bounces/complaints and suppressions. Validate authentication and reply routing with a real test domain before launch.

No new mail server or mailbox hosting is required: reuse Resend and the existing backend. Do not build inbound email, a DNS host, arbitrary SMTP configuration or separate provider accounts per charity for this feature.

Planning estimate: roughly **4–7 engineering days**, plus DNS propagation and charity IT coordination, assuming the existing donation-email flow is in place. Domain/account limits and pricing need checking with Resend when implementing. Automating domain conflict resolution or adding multiple mail providers would expand this scope substantially.
