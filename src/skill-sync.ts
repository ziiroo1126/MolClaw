import fs from 'fs';
import path from 'path';

function copyTree(srcPath: string, dstPath: string): void {
  if (fs.statSync(srcPath).isDirectory()) {
    fs.mkdirSync(dstPath, { recursive: true });
    for (const entry of fs.readdirSync(srcPath)) {
      copyTree(path.join(srcPath, entry), path.join(dstPath, entry));
    }
    return;
  }

  fs.mkdirSync(path.dirname(dstPath), { recursive: true });
  fs.copyFileSync(srcPath, dstPath);
}

export function syncSkillsDirectory(skillsSrc: string, skillsDst: string): void {
  if (!fs.existsSync(skillsSrc)) return;

  for (const skillDir of fs.readdirSync(skillsSrc)) {
    const srcDir = path.join(skillsSrc, skillDir);
    if (!fs.statSync(srcDir).isDirectory()) continue;
    copyTree(srcDir, path.join(skillsDst, skillDir));
  }
}
