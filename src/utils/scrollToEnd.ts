/** Bypass CSS smooth scrolling for layout corrections, including older Safari. */
export function scrollToEnd(element: HTMLElement, smooth = false) {
  if (smooth) { element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' }); return; }
  const previous = element.style.scrollBehavior;
  element.style.scrollBehavior = 'auto';
  element.scrollTop = element.scrollHeight;
  element.style.scrollBehavior = previous;
}
