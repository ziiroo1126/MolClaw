import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import { syncSkillsDirectory } from './skill-sync.js';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'molclaw-skill-sync-'));
  tempDirs.push(dir);
  return dir;
}

describe('syncSkillsDirectory', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('copies nested skill resources recursively', () => {
    const rootDir = createTempDir();
    const skillsSrc = path.join(rootDir, 'skills-src');
    const skillsDst = path.join(rootDir, 'skills-dst');

    fs.mkdirSync(path.join(skillsSrc, 'odesign-task-parser', 'scripts'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(skillsSrc, 'odesign-task-parser', 'references'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(skillsSrc, 'odesign-task-parser', 'SKILL.md'),
      'skill body\n',
    );
    fs.writeFileSync(
      path.join(skillsSrc, 'odesign-task-parser', 'scripts', 'validate.py'),
      'print("ok")\n',
    );
    fs.writeFileSync(
      path.join(skillsSrc, 'odesign-task-parser', 'references', 'patterns.md'),
      'patterns\n',
    );

    syncSkillsDirectory(skillsSrc, skillsDst);

    expect(
      fs.readFileSync(
        path.join(skillsDst, 'odesign-task-parser', 'SKILL.md'),
        'utf-8',
      ),
    ).toBe('skill body\n');
    expect(
      fs.readFileSync(
        path.join(
          skillsDst,
          'odesign-task-parser',
          'scripts',
          'validate.py',
        ),
        'utf-8',
      ),
    ).toBe('print("ok")\n');
    expect(
      fs.readFileSync(
        path.join(
          skillsDst,
          'odesign-task-parser',
          'references',
          'patterns.md',
        ),
        'utf-8',
      ),
    ).toBe('patterns\n');
  });
});
