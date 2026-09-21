// Queue shim, external so the CSP needs no inline allowance. Runs before /js/script.js replays the queue.
window.plausible =
  window.plausible ||
  function () {
    (plausible.q = plausible.q || []).push(arguments);
  };
window.plausible.init =
  window.plausible.init ||
  function (i) {
    plausible.o = i || {};
  };
plausible.init({ endpoint: "/api/event" });
