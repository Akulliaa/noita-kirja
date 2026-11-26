// The site's mood follows the reader's local time: background tint + ember colors.
export type Period = 'dawn' | 'day' | 'evening' | 'night';

function current(): Period {
  const h = new Date().getHours();
  if (h >= 5 && h < 9) return 'dawn';
  if (h >= 9 && h < 18) return 'day';
  if (h >= 18 && h < 22) return 'evening';
  return 'night';
}

export const tod = $state<{ period: Period }>({ period: current() });

let started = false;
export function startTimeOfDay() {
  if (started) return;
  started = true;
  const update = () => {
    tod.period = current();
    document.documentElement.dataset.tod = tod.period;
  };
  update();
  setInterval(update, 5 * 60_000); // cheap: one check every 5 minutes
}

export const EMBER_PALETTES: Record<Period, { colors: string[]; weights: number[] }> = {
  dawn: { colors: ['#ffd97a', '#ffb3c8', '#ffb347', '#b6ff8e', '#fff1c4', '#5fd3ff'], weights: [5, 3, 3, 2, 2, 1] },
  day: { colors: ['#ffb347', '#ff8a3d', '#ffd97a', '#b46cff', '#8dff6a', '#5fd3ff'], weights: [5, 4, 3, 2, 1, 1] },
  evening: { colors: ['#ff8a3d', '#ff6a3d', '#ffb347', '#e0484d', '#ffd97a', '#b46cff'], weights: [5, 4, 3, 2, 2, 1] },
  night: { colors: ['#5fd3ff', '#b46cff', '#8fb8ff', '#d8e6ff', '#8dff6a', '#ffd97a'], weights: [4, 4, 3, 2, 1, 1] },
};
