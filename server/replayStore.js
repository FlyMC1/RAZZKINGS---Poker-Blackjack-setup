import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const replayDir = join(process.cwd(), 'data', 'replays');
const retentionDays = normalizeRetentionDays(process.env.REPLAY_RETENTION_DAYS);

export async function saveReplay(replay) {
  await mkdir(replayDir, { recursive: true });
  const filePath = join(replayDir, `${replay.id}.json`);
  await writeFile(filePath, JSON.stringify(replay, null, 2), 'utf8');
  await cleanupExpiredReplays();
  return filePath;
}

export async function loadReplay(replayId) {
  const filePath = join(replayDir, `${replayId}.json`);
  const content = await readFile(filePath, 'utf8');
  const replay = JSON.parse(content);

  if (isReplayExpired(replay)) {
    await unlink(filePath).catch(() => undefined);
    throw new Error('Replay expired');
  }

  return replay;
}

export async function cleanupExpiredReplays() {
  await mkdir(replayDir, { recursive: true });
  const files = await readdir(replayDir).catch(() => []);

  for (const name of files) {
    if (!name.endsWith('.json')) {
      continue;
    }

    const filePath = join(replayDir, name);

    try {
      const content = await readFile(filePath, 'utf8');
      const replay = JSON.parse(content);

      if (isReplayExpired(replay)) {
        await unlink(filePath).catch(() => undefined);
      }
    } catch {
      const fileStat = await stat(filePath).catch(() => null);
      if (fileStat && Date.now() - fileStat.mtimeMs > retentionDays * 24 * 60 * 60 * 1000) {
        await unlink(filePath).catch(() => undefined);
      }
    }
  }
}

function isReplayExpired(replay) {
  const finishedAt = Date.parse(replay?.finishedAt ?? '');
  if (!Number.isFinite(finishedAt)) {
    return false;
  }

  const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
  return Date.now() - finishedAt > maxAgeMs;
}

function normalizeRetentionDays(value) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }

  return 30;
}