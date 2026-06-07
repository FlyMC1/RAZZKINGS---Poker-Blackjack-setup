import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const replayDir = join(process.cwd(), 'data', 'replays');

export async function saveReplay(replay) {
  await mkdir(replayDir, { recursive: true });
  const filePath = join(replayDir, `${replay.id}.json`);
  await writeFile(filePath, JSON.stringify(replay, null, 2), 'utf8');
  return filePath;
}

export async function loadReplay(replayId) {
  const filePath = join(replayDir, `${replayId}.json`);
  const content = await readFile(filePath, 'utf8');
  return JSON.parse(content);
}