import { listReplays } from '../recording/api.ts';
import type { ReplayFileInfo } from '../recording/types.ts';

const el = () => document.getElementById('replay-browser')!;
const listEl = () => document.getElementById('replay-list')!;
const backBtn = () => document.getElementById('replay-browser-back')!;

export function showReplayBrowser(
  onSelect: (filename: string) => void,
  onBack: () => void,
): void {
  el().classList.remove('hidden');
  const list = listEl();
  list.innerHTML = '<p class="no-replays">Loading...</p>';

  backBtn().onclick = () => {
    hideReplayBrowser();
    onBack();
  };

  listReplays().then((replays: ReplayFileInfo[]) => {
    list.innerHTML = '';
    if (replays.length === 0) {
      list.innerHTML = '<p class="no-replays">No replays found</p>';
      return;
    }
    for (const info of replays) {
      const btn = document.createElement('button');
      btn.className = 'replay-item';
      btn.innerHTML = `<span class="replay-type">[${info.type}]</span> ${info.filename}`;
      btn.addEventListener('click', () => {
        hideReplayBrowser();
        onSelect(info.filename);
      });
      list.appendChild(btn);
    }
  }).catch(() => {
    list.innerHTML = '<p class="no-replays">Failed to load replays</p>';
  });
}

export function hideReplayBrowser(): void {
  el().classList.add('hidden');
}
