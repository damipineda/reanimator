// Shared helpers for driving the ORIGINAL SWF inside Ruffle via Playwright.
// Ported from the Phase 0 spike at work/lunar-lander/compare/ruffle-helpers.mjs
// (see docs/KIRO_NOTES.md, "Blockers & Workarounds") into the formal
// pipeline, unchanged in substance.
//
// Ruffle shows its own overlays (play-button gate, unmute gate, and a
// non-deterministic "hardware acceleration disabled" warning modal that
// appears with a variable delay) that intercept ALL clicks until
// dismissed. dismissOverlays() must be called before every interaction,
// not just once, because the hardware-acceleration modal was observed to
// appear at unpredictable times.
export async function dismissOverlays(page) {
  await page.evaluate(() => {
    const root = window.__playerEl && window.__playerEl.shadowRoot;
    if (!root) return;
    const playBtn = root.querySelector('#play-button');
    if (playBtn && getComputedStyle(playBtn).display !== 'none') playBtn.click();
    const unmute = root.querySelector('#unmute-overlay');
    if (unmute && getComputedStyle(unmute).display !== 'none') unmute.click();
    const hwModal = root.querySelector('#hardware-acceleration-modal');
    if (hwModal && !hwModal.classList.contains('hidden')) {
      const closeBtn = hwModal.querySelector('.close-modal');
      if (closeBtn) closeBtn.click();
    }
  });
}

// Clicks at (x,y) in the 800x600 SWF/canvas coordinate space (the harness
// page has no padding/centering, so this is also the page/viewport
// coordinate space - see harness/original.html), dismissing any Ruffle
// overlay immediately before AND after the click.
export async function swfClick(page, x, y) {
  await dismissOverlays(page);
  await page.waitForTimeout(100);
  await dismissOverlays(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.up();
  await page.waitForTimeout(60);
  await dismissOverlays(page);
}

// For a REAL aligned-start comparison against another app (e.g. the
// hand-built rebuild, whose own click handler starts its clock
// synchronously) - swfClick() above has ~220ms of built-in dismiss/settle
// waits BEFORE the actual mouse-down, which would itself introduce a
// head-start-style misalignment of the kind found with the AI-only
// rebuild (see docs/KIRO_NOTES.md). Split into two steps so all of that
// settling happens BEFORE the caller captures its own t0:
//   1. prepareAlignedClick(page, x, y) - dismiss overlays, move the mouse
//      into position. Call this BEFORE capturing t0.
//   2. triggerAlignedClick(page) - the actual mouse down+up, with NO
//      artificial wait before the down event. Call this immediately
//      after capturing t0.
export async function prepareAlignedClick(page, x, y) {
  await dismissOverlays(page);
  await page.waitForTimeout(100);
  await dismissOverlays(page);
  await page.mouse.move(x, y);
}

export async function triggerAlignedClick(page) {
  await page.mouse.down();
  await page.waitForTimeout(40); // real click duration, not a settle delay
  await page.mouse.up();
}

export async function loadOriginal(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await dismissOverlays(page);
  await page.waitForTimeout(800);
  await dismissOverlays(page);
  // Root cause found during Phase 0 debugging (docs/KIRO_NOTES.md): mouse
  // clicks on the SWF's own buttons were silently ignored by Ruffle until
  // the player/canvas had received focus via a prior click. A neutral
  // click (away from any button) establishes this focus first.
  await page.mouse.click(10, 10);
  await page.waitForTimeout(150);
  await dismissOverlays(page);
}

// Sends one scripted keydown (and, after a short hold, keyup) at the
// SWF's own focused player element - used to replay a Scenario's
// {t, type:'keydown', key} events. Each call is one discrete DOM
// KeyboardEvent, matching how main.js/controls.js (rebuild) and Ruffle's
// forwarded Key.onKeyDown (original) both react once per event, with no
// reliance on OS key-repeat timing.
export async function swfKeyPress(page, key) {
  await page.keyboard.down(key);
  await page.waitForTimeout(16);
  await page.keyboard.up(key);
}
