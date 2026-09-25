/**
 * Puts code listings that scroll in the tab order, so that keyboard users
 * can focus them and scroll with the arrow keys. Listings that fit stay out
 * of the tab order. Listings in tab panels are always in the tab order.
 */
export function setUpScrollableCode(root: ParentNode = document): ResizeObserver {
  const observer = new ResizeObserver((entries) => {
    for (const { target } of entries) {
      const listing = target as HTMLElement;
      const scrolls = listing.scrollWidth > listing.clientWidth || listing.scrollHeight > listing.clientHeight;
      if (scrolls) listing.tabIndex = 0;
      else listing.removeAttribute("tabindex");
    }
  });
  for (const listing of root.querySelectorAll<HTMLElement>('pre:not([role="tabpanel"])')) observer.observe(listing);
  return observer;
}
