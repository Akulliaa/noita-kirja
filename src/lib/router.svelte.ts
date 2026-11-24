// Hash router (works on GitHub Pages without server config): #/notes/123?x=1
export const route = $state<{ path: string; parts: string[]; query: URLSearchParams }>({
  path: '/',
  parts: [],
  query: new URLSearchParams(),
});

function parse() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  route.path = path;
  route.parts = path.split('/').filter(Boolean);
  route.query = new URLSearchParams(qs);
}
window.addEventListener('hashchange', parse);
parse();

export const go = (path: string) => { location.hash = path; };
