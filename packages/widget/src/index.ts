import { bitcoinQR } from "./qr";
// Keep the bytes identical to the stylesheet hashed by the host app's CSP.
import styles from "./styles.css?raw";
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const script = Array.from(document.scripts).find((s) =>
  /\/widget\/v1\.js(?:\?|$)/.test(s.src),
);
const fontLoads = new Set<string>();
const defaultApi = script ? new URL(script.src).origin : location.origin;
type Session = {
  address: string;
  funded: boolean;
  emailStatus: "none" | "pending" | "sent" | "failed";
};
type Config = {
  heading: string;
  description: string;
  accent?: string;
  background?: string;
  text?: string;
  buttonText?: string;
  button: string;
  consent: string;
  preset: string;
  showBranding: boolean;
};
const defaults: Config = {
  heading: "Donate bitcoin",
  description: "Support our work with a bitcoin donation.",
  button: "Get donation address",
  consent: "Keep me updated by email.",
  preset: "satsrecord",
  showBranding: true,
};

class SatsRecordDonate extends HTMLElement {
  static observedAttributes = ["preview-state", "show-branding"];
  private root = this.attachShadow({ mode: "open" });
  private config = { ...defaults };
  private organisation = "the organisation";
  private token = "";
  private session: Session | null = null;
  private timer?: ReturnType<typeof setTimeout>;
  private initialized = false;
  private copyTimer?: ReturnType<typeof setTimeout>;
  private get showBranding() {
    return this.hasAttribute("show-branding")
      ? this.getAttribute("show-branding") !== "false"
      : this.config.showBranding;
  }
  private get preview() {
    return this.hasAttribute("preview");
  }
  private get api() {
    return (this.getAttribute("api") || defaultApi).replace(/\/$/, "");
  }
  private get endpoint() {
    return `${this.api}/api/widget/${encodeURIComponent(this.getAttribute("org") || "")}`;
  }
  private get storageKey() {
    return `satsrecord:v1:${this.api}:${this.getAttribute("org")}`;
  }
  connectedCallback() {
    if (this.initialized) {
      this.poll();
      return;
    }
    this.initialized = true;
    void this.start();
  }
  disconnectedCallback() {
    clearTimeout(this.timer);
    clearTimeout(this.copyTimer);
  }
  attributeChangedCallback() {
    if (this.initialized && this.preview) this.render();
  }
  private text(slot: "heading" | "description" | "button" | "consent") {
    return (
      this.querySelector(`[slot="${slot}"]`)?.textContent?.trim() ||
      this.config[slot]
    );
  }
  private readToken() {
    try {
      const value = localStorage.getItem(this.storageKey);
      if (value && /^[a-f0-9]{64}$/.test(value)) this.token = value;
    } catch {
      /* private browsing: in-memory session still works */
    }
  }
  private newToken() {
    this.token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("");
    try {
      localStorage.setItem(this.storageKey, this.token);
    } catch {
      /* address remains usable */
    }
  }
  private async request(init: RequestInit = {}) {
    const response = await fetch(this.endpoint, {
      ...init,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(15_000),
    });
    const result = await response.json();
    if (!response.ok)
      throw Object.assign(
        new Error(result.error || "Unable to connect. Please try again."),
        { status: response.status },
      );
    return result;
  }
  private async start() {
    if (this.preview) {
      this.organisation =
        this.getAttribute("organisation") || "your organisation";
      this.render();
      return;
    }
    this.root.innerHTML = `<style>${styles}</style><div class="card loading" role="status">Loading donation form…</div>`;
    try {
      const data = await this.request();
      this.config = { ...defaults, ...data.config };
      if (!["satsrecord", "minimal", "custom"].includes(this.config.preset))
        this.config.preset = "satsrecord";
      this.organisation = data.organisation;
      if (!this.hasAttribute("preset"))
        this.setAttribute("preset", this.config.preset);
      if (this.getAttribute("preset") === "custom") {
        for (const [key, variable] of [
          ["accent", "accent"],
          ["background", "background"],
          ["text", "text"],
          ["buttonText", "button-text"],
        ] as const) {
          const colour = this.config[key];
          if (
            colour &&
            /^#[0-9a-f]{6}$/i.test(colour) &&
            !this.style.getPropertyValue(`--sr-${variable}`)
          )
            this.style.setProperty(`--sr-${variable}`, colour);
        }
      }
      this.readToken();
      if (this.token) {
        try {
          this.session = await this.request({
            headers: { Authorization: `Bearer ${this.token}` },
          });
        } catch (error) {
          if ((error as { status?: number }).status !== 404) throw error;
        }
      }
      this.render();
      this.poll();
    } catch (error) {
      this.root.innerHTML = `<style>${styles}</style><div class="card body"><p role="alert">${escape(this.message(error))}</p><button class="secondary">Try again</button></div>`;
      this.root.querySelector("button")!.onclick = () => void this.start();
    }
  }
  private message(error: unknown) {
    return error instanceof Error &&
      error.name !== "TimeoutError" &&
      error.name !== "TypeError"
      ? error.message
      : "Unable to connect. Please try again.";
  }
  private render() {
    if (!["minimal", "custom"].includes(this.getAttribute("preset") || "")) {
      const fontUrl = new URL(`${this.api}/widget/font.woff2`, location.href)
        .href;
      if (!fontLoads.has(fontUrl) && "FontFace" in window) {
        fontLoads.add(fontUrl);
        const face = new FontFace(
          "SatsRecord Widget",
          `url(${JSON.stringify(fontUrl)})`,
          { weight: "400 800", display: "swap" },
        );
        document.fonts.add(face);
        void face.load().catch(() => {
          fontLoads.delete(fontUrl);
        });
      }
    }
    const previewState = this.preview
      ? this.getAttribute("preview-state") || "form"
      : "";
    const state =
      (previewState === "anonymous" ? "form" : previewState) ||
      (this.session ? (this.session.funded ? "received" : "address") : "form");
    const title =
      state === "received"
        ? "Received, thank you."
        : state === "address"
          ? "Your donation address."
          : this.text("heading");
    let body = "";
    if (state === "form")
      body = `<form class="fields"><div class="form-fields"><label for="name"><span class="field-label">Name <span class="optional">Optional</span></span><input id="name" name="name" autocomplete="name" maxlength="200" placeholder="Your name"></label><label for="email"><span class="field-label">Email <span class="optional">Optional</span></span><input id="email" name="email" type="email" autocomplete="email" maxlength="254" placeholder="you@example.org"></label><label class="consent"><input name="marketing" type="checkbox"><span>${escape(this.text("consent"))}</span></label><button class="primary" type="submit" ${this.preview ? "disabled" : ""}>${escape(this.text("button"))}</button></div><div class="anonymous-confirmation" hidden inert role="group" aria-labelledby="anonymous-title"><h3 id="anonymous-title" tabindex="-1">Continue without email?</h3><p>Without your email, the charity can’t send you a receipt, confirmation or thank-you message.</p><div class="actions"><button type="button" class="primary" id="add-details" ${this.preview ? "disabled" : ""}>Add my email</button><button type="button" class="secondary" id="confirm-anonymous" ${this.preview ? "disabled" : ""}>Continue without email</button></div></div><p class="error" role="alert"></p></form>`;
    if (state === "address") {
      const address = this.session?.address || "bc1q…your donation address";
      body = `<div class="qr" role="img" aria-label="${this.preview ? "Sample QR placeholder" : "Scan to open this Bitcoin donation address"}">${this.preview ? '<div class="sample-qr"><span>Sample QR</span></div>' : bitcoinQR(`bitcoin:${address}`)}</div><code class="address" tabindex="0">${escape(address)}</code><div class="actions"><button class="primary" id="copy" aria-live="polite" ${this.preview ? "disabled" : ""}>Copy address</button>${this.preview ? '<button class="secondary" disabled>Open in wallet ↗</button>' : `<a class="secondary" href="bitcoin:${escape(address)}">Open in wallet ↗</a>`}</div><p class="status" role="status">${this.session?.emailStatus === "sent" ? "We’ve also emailed this address to you." : this.session?.emailStatus === "failed" ? "We couldn’t email your address. Please copy it and keep it somewhere safe." : this.session?.emailStatus === "pending" ? "Your address email is being prepared." : "Keep this address to donate later."}</p><p class="sub">Send only bitcoin (BTC) on the Bitcoin network. You choose the amount in your wallet.</p>`;
    }
    if (state === "received")
      body = `<div class="received"><div class="tick" aria-hidden="true">✓</div><p>Your bitcoin donation has been detected. Thank you for supporting ${escape(this.organisation)}.</p></div><button class="primary" id="again" ${this.preview ? "disabled" : ""}>Make another donation ↗</button>`;
    this.root.innerHTML = `<style>${styles}</style><section class="card" aria-label="Bitcoin donation"><div class="body"><div class="intro"><h2 tabindex="-1">${escape(title)}</h2>${state === "form" ? `<p class="sub org">${escape(this.text("description"))}</p>` : ""}</div>${body}${this.preview ? '<p class="preview-note">Preview only · no address will be issued</p>' : ""}</div><div class="footer" ${this.showBranding ? "" : "hidden"}><span>Powered by</span><a href="https://satsrecord.org" target="_blank" rel="noopener noreferrer"><svg viewBox="2 2 28 28" aria-hidden="true"><rect x="6" y="6" width="24" height="24" fill="currentColor"/><rect x="3" y="3" width="22" height="22" fill="var(--surface)" stroke="currentColor" stroke-width="2"/><rect x="7" y="9" width="14" height="3" fill="currentColor"/></svg>SatsRecord</a></div></section>`;
    this.root.querySelector("form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!this.preview) void this.submit();
    });
    this.root.querySelector("#add-details")?.addEventListener("click", () => {
      this.confirmAnonymous(false);
      this.root.querySelector<HTMLInputElement>("#email")?.focus();
    });
    this.root
      .querySelector("#confirm-anonymous")
      ?.addEventListener("click", () => {
        if (!this.preview) void this.submit(true);
      });
    this.root.querySelector("form")?.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        this.root.querySelector("form[data-confirming]") &&
        !this.root.querySelector('[aria-busy="true"]')
      ) {
        this.confirmAnonymous(false);
        this.root.querySelector<HTMLInputElement>("#email")?.focus();
      }
    });
    this.root
      .querySelector<HTMLButtonElement>("#copy")
      ?.addEventListener("click", async () => {
        const button = this.root.querySelector<HTMLButtonElement>("#copy")!;
        clearTimeout(this.copyTimer);
        try {
          await navigator.clipboard.writeText(this.session!.address);
          button.textContent = "Copied!";
        } catch {
          button.textContent = "Copy failed";
          const code = this.root.querySelector<HTMLElement>(".address")!;
          const range = document.createRange();
          range.selectNodeContents(code);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          code.focus();
          this.root.querySelector(".status")!.textContent =
            "Select and copy the address above.";
        }
        this.copyTimer = setTimeout(() => {
          button.textContent = "Copy address";
        }, 2000);
      });
    this.root.querySelector("#again")?.addEventListener("click", () => {
      clearTimeout(this.timer);
      this.newToken();
      this.session = null;
      this.render();
      this.focusHeading();
    });
    if (previewState === "anonymous") this.confirmAnonymous(true);
  }
  private focusHeading() {
    this.root.querySelector<HTMLElement>("h2")?.focus();
  }
  private confirmAnonymous(show: boolean) {
    const form = this.root.querySelector<HTMLFormElement>("form")!;
    form.toggleAttribute("data-confirming", show);
    this.root.querySelector<HTMLElement>(".form-fields")!.inert = show;
    this.root.querySelector<HTMLElement>(".anonymous-confirmation")!.hidden =
      !show;
    this.root.querySelector<HTMLElement>(".anonymous-confirmation")!.inert =
      !show;
    if (show && !this.preview)
      this.root.querySelector<HTMLElement>("#anonymous-title")!.focus();
  }
  private async submit(anonymousConfirmed = false) {
    const form = this.root.querySelector<HTMLFormElement>("form")!;
    const button = form.querySelector<HTMLButtonElement>(
      anonymousConfirmed ? "#confirm-anonymous" : "button[type=submit]",
    )!;
    if (button.disabled) return;
    const data = new FormData(form);
    if (data.get("marketing") && !String(data.get("email") || "").trim()) {
      form.querySelector(".error")!.textContent =
        "Add an email address to receive updates.";
      return;
    }
    if (!anonymousConfirmed && !String(data.get("email") || "").trim()) {
      this.confirmAnonymous(true);
      return;
    }
    const buttonText = button.textContent;
    for (const control of form.querySelectorAll<
      HTMLButtonElement | HTMLInputElement
    >("button, input"))
      control.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.innerHTML =
      '<span class="spinner" aria-hidden="true"></span>Preparing address…';
    form.querySelector(".error")!.textContent = "";
    try {
      // Persist before POST so a lost response can safely be retried after a reload.
      this.readToken();
      if (!this.token) this.newToken();
      this.session = await this.request({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: this.token,
          name: data.get("name"),
          email: data.get("email"),
          marketing: !!data.get("marketing"),
          consentLabel: this.text("consent"),
        }),
      });
      this.render();
      this.focusHeading();
      this.poll();
    } catch (error) {
      form.querySelector(".error")!.textContent = this.message(error);
      for (const control of form.querySelectorAll<
        HTMLButtonElement | HTMLInputElement
      >("button, input"))
        control.disabled = false;
      button.removeAttribute("aria-busy");
      button.textContent = buttonText;
    }
  }
  private poll() {
    clearTimeout(this.timer);
    if (
      this.preview ||
      !this.session ||
      this.session.funded ||
      !this.isConnected
    )
      return;
    this.timer = setTimeout(async () => {
      if (!document.hidden) {
        try {
          const next: Session = await this.request({
            headers: { Authorization: `Bearer ${this.token}` },
          });
          const changed =
            next.funded !== this.session?.funded ||
            next.emailStatus !== this.session?.emailStatus;
          this.session = next;
          if (changed) {
            this.render();
            if (next.funded) this.focusHeading();
          }
        } catch {
          /* Keep the address visible through temporary outages. */
        }
      }
      this.poll();
    }, 15_000);
  }
}
if (!customElements.get("satsrecord-donate"))
  customElements.define("satsrecord-donate", SatsRecordDonate);
