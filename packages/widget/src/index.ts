import { renderSVG } from "uqr";
import styles from "./styles.css?inline";
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
const defaultApi = script ? new URL(script.src).origin : location.origin;
type Session = {
  address: string;
  funded: boolean;
  emailStatus: "none" | "pending" | "sent" | "failed";
};
type Config = {
  heading: string;
  button: string;
  consent: string;
  preset: string;
};
const defaults: Config = {
  heading: "Donate bitcoin",
  button: "Get donation address",
  consent: "Keep me updated by email.",
  preset: "satsrecord",
};

class SatsRecordDonate extends HTMLElement {
  static observedAttributes = ["preview-state"];
  private root = this.attachShadow({ mode: "open" });
  private config = { ...defaults };
  private organisation = "the organisation";
  private token = "";
  private session: Session | null = null;
  private timer?: ReturnType<typeof setTimeout>;
  private initialized = false;
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
  }
  attributeChangedCallback() {
    if (this.initialized && this.preview) this.render();
  }
  private text(slot: keyof Config) {
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
      this.config = data.config;
      this.organisation = data.organisation;
      if (!this.hasAttribute("preset"))
        this.setAttribute("preset", this.config.preset);
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
    const previewState = this.preview
      ? this.getAttribute("preview-state") || "form"
      : "";
    const state =
      previewState ||
      (this.session ? (this.session.funded ? "received" : "address") : "form");
    const title =
      state === "received"
        ? "Received, thank you."
        : state === "address"
          ? "Your donation address."
          : this.text("heading");
    let body = "";
    if (state === "form")
      body = `<form class="fields"><label for="name">Name <span class="optional">Optional</span><input id="name" name="name" autocomplete="name" maxlength="200" placeholder="Your name"></label><label for="email">Email <span class="optional">Optional · we’ll email your address</span><input id="email" name="email" type="email" autocomplete="email" maxlength="254" placeholder="you@example.org"></label><label class="consent"><input name="marketing" type="checkbox"><span>${escape(this.text("consent"))}</span></label><button class="primary" ${this.preview ? "disabled" : ""}>${escape(this.text("button"))} <span aria-hidden="true">↗</span></button><p class="error" role="alert"></p></form>`;
    if (state === "address") {
      const address = this.session?.address || "bc1q…your donation address";
      body = `<div class="qr" role="img" aria-label="${this.preview ? "Sample QR placeholder" : "Scan to open this Bitcoin donation address"}">${this.preview ? '<div class="sample-qr"><span>Sample QR</span></div>' : renderSVG(`bitcoin:${address}`, { border: 4, ecc: "M" })}</div><code class="address" tabindex="0">${escape(address)}</code><div class="actions"><button class="primary" id="copy" ${this.preview ? "disabled" : ""}>Copy address</button>${this.preview ? '<button class="secondary" disabled>Open in wallet ↗</button>' : `<a class="secondary" href="bitcoin:${escape(address)}">Open in wallet ↗</a>`}</div><p class="status" role="status">${this.session?.emailStatus === "sent" ? "We’ve also emailed this address to you." : this.session?.emailStatus === "failed" ? "We couldn’t email your address. Please copy it and keep it somewhere safe." : this.session?.emailStatus === "pending" ? "Your address email is being prepared." : "Keep this address to donate later."}</p><p class="sub">Send only bitcoin (BTC) on the Bitcoin network. You choose the amount in your wallet.</p>`;
    }
    if (state === "received")
      body = `<div class="received"><div class="tick" aria-hidden="true">✓</div><p>Your bitcoin donation has been detected. Thank you for supporting ${escape(this.organisation)}.</p></div><button class="primary" id="again" ${this.preview ? "disabled" : ""}>Make another donation ↗</button>`;
    this.root.innerHTML = `<style>${styles}</style><section class="card" aria-label="Bitcoin donation"><div class="top"><span class="eyebrow">Bitcoin. Direct to the cause.</span><span class="bitcoin" aria-hidden="true">₿</span></div><div class="body"><div class="intro"><h2 tabindex="-1">${escape(title)}</h2>${state === "form" ? `<p class="sub org">Support ${escape(this.organisation)}. Give directly to their wallet.</p>` : ""}</div>${body}${this.preview ? '<p class="preview-note">Preview only · no address will be issued</p>' : ""}</div><div class="footer"><span>Direct. Self-custodial.</span><a href="https://satsrecord.org" target="_blank" rel="noopener noreferrer">SatsRecord ↗</a></div></section>`;
    this.root.querySelector("form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!this.preview) void this.submit();
    });
    this.root
      .querySelector<HTMLButtonElement>("#copy")
      ?.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(this.session!.address);
          this.root.querySelector(".status")!.textContent = "Address copied.";
        } catch {
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
      });
    this.root.querySelector("#again")?.addEventListener("click", () => {
      clearTimeout(this.timer);
      this.newToken();
      this.session = null;
      this.render();
      this.focusHeading();
    });
  }
  private focusHeading() {
    this.root.querySelector<HTMLElement>("h2")?.focus();
  }
  private async submit() {
    const form = this.root.querySelector<HTMLFormElement>("form")!;
    const button = form.querySelector("button")!;
    if (button.disabled) return;
    const data = new FormData(form);
    if (data.get("marketing") && !String(data.get("email") || "").trim()) {
      form.querySelector(".error")!.textContent =
        "Add an email address to receive updates.";
      return;
    }
    button.disabled = true;
    button.textContent = "Preparing your address…";
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
      button.disabled = false;
      button.textContent = this.text("button");
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
