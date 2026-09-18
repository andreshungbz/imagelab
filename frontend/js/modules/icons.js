// Decorative line icons that inherit their size and color from CSS.
const paths = {
  upload:
    '<path d="M7 17H5a4 4 0 0 1-.5-8 7 7 0 0 1 13.6-1.5A5 5 0 0 1 19 17h-2M12 21V10m-4 4 4-4 4 4"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21M3 16l4-4 4 4"/>',
  job: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h.01M12 7h3M9 12h.01M12 12h3M9 17h.01M12 17h3"/>',
  settings:
    '<path d="m10 3-.5 2-2 .9-1.9-.6-2 3.4L5 10v3l-1.4 1.3 2 3.4 1.9-.6 2 .9.5 2h4l.5-2 2-.9 1.9.6 2-3.4L19 13v-3l1.4-1.3-2-3.4-1.9.6-2-.9-.5-2z"/><circle cx="12" cy="11.5" r="3"/>',
  refresh:
    '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 11.5-1L20 9M4 15l2.5 3A7 7 0 0 0 18 17"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
};

// icon returns an SVG icon by name.
export function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name] || paths.image}</svg>`;
}
