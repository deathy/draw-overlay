// A tiny stroked icon set. Inline rather than a font or sprite sheet: there are
// nine of them, and it keeps the app at zero image requests.

const PATHS: Record<string, string> = {
  image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z',
  unlock: 'M7 11V8a5 5 0 0 1 9.5-2M5 11h14v10H5z',
  torch: 'M9 2h6v4l-1 3v13h-4V9L9 6zM9 6h6',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  rotateLeft: 'M3 8h7a6 6 0 1 1-6 6M3 8l3-3M3 8l3 3',
  rotateRight: 'M21 8h-7a6 6 0 1 0 6 6M21 8l-3-3M21 8l-3 3',
  mirror: 'M12 3v18M8 7 4 12l4 5zM16 7l4 5-4 5z',
  reset: 'M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6M20 9V4h-5M4 15v5h5M20 4l-6 6M4 20l6-6',
  close: 'M6 6l12 12M18 6L6 18',
  camera: 'M3 7h4l2-2h6l2 2h4v12H3zM12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z'
};

export function Icon({ name, size = 22 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg
      class="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}
