/** Svelte action: render the element under <body> (escapes transformed / masked ancestors). */
export function portal(node: HTMLElement) {
  document.body.appendChild(node);
  return { destroy: () => node.remove() };
}
