/** URLs of the UI atlas sprites (individual PNGs) for use in React/CSS. Bundled through Vite, so hashed and cache-friendly. */
const urls = import.meta.glob<string>('../../assets/png/default/ui/**/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

export function uiUrl(name: string): string {
  const hit = Object.entries(urls).find(([path]) => path.endsWith(`/${name}.png`));
  if (!hit) throw new Error(`UI asset not found: ${name}`);
  return hit[1];
}
