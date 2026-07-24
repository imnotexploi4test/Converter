export function initEffects() {
  // NOTE: this used to be wrapped in its own document.addEventListener('DOMContentLoaded', ...),
  // but initEffects() is only ever called (from main.js) from inside a DOMContentLoaded handler
  // that has already fired — registering another listener for the same event at that point
  // never fires again, so the shimmer + aria-busy observer below never ran. Fixed by running
  // this logic immediately, since it's already safe to touch the DOM by the time we're called.
  const body = document.body;
  body.classList.add('page-shimmer');
  setTimeout(() => body.classList.remove('page-shimmer'), 1200);

  const dropZone = document.getElementById('dropZone');
  if (!dropZone) return;
  const observer = new MutationObserver(() => {
    if (dropZone.classList.contains('uploading')) {
      dropZone.setAttribute('aria-busy', 'true');
    } else {
      dropZone.removeAttribute('aria-busy');
    }
  });
  observer.observe(dropZone, { attributes: true, attributeFilter: ['class'] });
}

