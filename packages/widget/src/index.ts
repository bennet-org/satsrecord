// <satsrecord-donate org="..."> placeholder. Real widget lands in ROADMAP Phase 5.
class SatsRecordDonate extends HTMLElement {
  connectedCallback() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<p part="notice">SatsRecord widget for org <code>${this.getAttribute('org') ?? '?'}</code>. Not live yet.</p>`;
  }
}
if (!customElements.get('satsrecord-donate')) customElements.define('satsrecord-donate', SatsRecordDonate);
