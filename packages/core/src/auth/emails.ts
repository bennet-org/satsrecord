// Auth-flow emails. Plain text first, HTML mirrors it. Versions are recorded on every send.
export const MAGIC_LINK_TEMPLATE = "magic-link@1";
export const MEMBER_INVITATION_TEMPLATE = "member-invitation@1";
export const ORGANISATION_INVITE_TEMPLATE = "organisation-invite@1";

export function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}

function wrap(paragraphs: string[], url: string, cta: string) {
  const text = `${paragraphs.join("\n\n")}\n\n${url}\n`;
  const html = `${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}<p><a href="${escapeHtml(url)}">${escapeHtml(cta)}</a></p><p style="color:#666;font-size:13px">Or paste this into your browser: ${escapeHtml(url)}</p>`;
  return { text, html };
}

export function magicLinkEmail(opts: { url: string; appName: string }) {
  return {
    subject: `Sign in to ${opts.appName}`,
    templateVersion: MAGIC_LINK_TEMPLATE,
    ...wrap(
      [
        `Here is your sign-in link. It works once and expires in 10 minutes.`,
        `If you did not ask for it, ignore this email.`,
      ],
      opts.url,
      `Sign in to ${opts.appName}`,
    ),
  };
}

export function memberInvitationEmail(opts: {
  url: string;
  appName: string;
  organisationName: string;
  inviterName: string;
}) {
  return {
    subject: `${opts.inviterName} invited you to ${opts.organisationName} on ${opts.appName}`,
    templateVersion: MEMBER_INVITATION_TEMPLATE,
    ...wrap(
      [
        `${opts.inviterName} has invited you to join ${opts.organisationName} on ${opts.appName}.`,
        `Accept the invitation to see the organisation's donations and settings. The link expires in 7 days.`,
      ],
      opts.url,
      "Accept invitation",
    ),
  };
}

export function organisationInviteEmail(opts: {
  url: string;
  appName: string;
  organisationName: string;
}) {
  return {
    subject: `Your ${opts.appName} invitation for ${opts.organisationName}`,
    templateVersion: ORGANISATION_INVITE_TEMPLATE,
    ...wrap(
      [
        `You are invited to set up ${opts.organisationName} on ${opts.appName}.`,
        `Follow the link to sign in and create the organisation. You will be its first member and can invite colleagues from the team page. The link expires in 14 days.`,
      ],
      opts.url,
      "Set up your organisation",
    ),
  };
}
