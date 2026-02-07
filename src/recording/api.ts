import type { Replay, ReplayFileInfo } from './types.ts';

export async function saveReplay(replay: Replay): Promise<string> {
  const res = await fetch('/api/save-replay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(replay),
  });
  if (!res.ok) throw new Error(`Failed to save replay: ${res.statusText}`);
  const data = await res.json();
  return data.filename;
}

export async function listReplays(): Promise<ReplayFileInfo[]> {
  const res = await fetch('/api/replays');
  if (!res.ok) throw new Error(`Failed to list replays: ${res.statusText}`);
  return res.json();
}

export async function loadReplay(filename: string): Promise<Replay> {
  const res = await fetch(`/api/replays/${encodeURIComponent(filename)}`);
  if (!res.ok) throw new Error(`Failed to load replay: ${res.statusText}`);
  return res.json();
}
