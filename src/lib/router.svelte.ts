// Hash router (works on GitHub Pages without server config): #/notes/123
export const route = $state<{ path: string; parts: string[] }>({ path: '/', parts: [] });

function parse() {
  const raw = location.hash.replace(/^#/, '') || '/';
  route.path = raw;
  route.parts = raw.split('/').filter(Boolean);
}
window.addEventListener('hashchange', parse);
parse();

export const go = (path: string) => { location.hash = path; };
