#!/usr/bin/env python3
"""Build the renderer patch against an exact installed Pl3xMap JAR."""
import argparse
from copy import copy
import hashlib
import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
SOURCES = [
    'image/FileWriteBatch.java', 'image/TileImage.java',
    'renderer/task/RenderBatch.java', 'renderer/task/RegionProcessor.java',
    'renderer/task/RegionScanTask.java', 'renderer/Renderer.java',
    'renderer/BlockInfoRenderer.java',
]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-jar', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--javac', default='javac')
parser.add_argument('--expected-base-commit', default='9876e4b')
args = parser.parse_args()
base = args.base_jar.resolve()
output = args.output.resolve()
if base == output:
    parser.error('Output must differ from the original JAR')
commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
dirty = subprocess.check_output(['git', 'status', '--porcelain', '--',
    *['core/src/main/java/net/pl3x/map/core/' + name for name in SOURCES]], cwd=ROOT, text=True)
if dirty:
    raise ValueError('Commit the renderer sources before packaging a patch')
with tempfile.TemporaryDirectory(prefix='pl3x-render-build-') as temporary:
    classes = Path(temporary) / 'classes'
    subprocess.run([args.javac, '--release', '25', '-cp', str(base), '-d', str(classes),
                    *[str(ROOT / 'core/src/main/java/net/pl3x/map/core' / name) for name in SOURCES]], check=True)
    replacements = {str(path.relative_to(classes)): path.read_bytes() for path in classes.rglob('*.class')}
    with ZipFile(base) as original:
        if any(name.startswith('META-INF/') and name.endswith(('.SF', '.RSA', '.DSA')) for name in original.namelist()):
            raise ValueError('Cannot patch a signed JAR')
        lines = original.read('META-INF/MANIFEST.MF').decode().splitlines()
        original_commit = next(line.split(': ', 1)[1] for line in lines if line.startswith('Git-Commit: '))
        if original_commit != args.expected_base_commit:
            raise ValueError('Unexpected original plugin commit: ' + original_commit)
        lines = [line for line in lines if line and not line.startswith('Git-Commit: ')]
        lines += ['Git-Commit: ' + commit[:7], 'Base-Git-Commit: ' + original_commit,
                  'Render-Patch: parent-tile-write-batch']
        replacements['META-INF/MANIFEST.MF'] = ('\r\n'.join(lines) + '\r\n\r\n').encode()
        output.parent.mkdir(parents=True, exist_ok=True)
        staging = Path(temporary) / 'patched.jar'
        with ZipFile(staging, 'w') as patched:
            for entry in original.infolist():
                patched.writestr(copy(entry), replacements.pop(entry.filename, original.read(entry)))
            for name, content in replacements.items():
                patched.writestr(name, content)
        with ZipFile(staging) as patched:
            assert patched.testzip() is None
            changed = [name for name in original.namelist() if original.read(name) != patched.read(name)]
            assert all(name == 'META-INF/MANIFEST.MF' or name.startswith('net/pl3x/map/core/') and name.endswith('.class') for name in changed)
            added = sorted(set(patched.namelist()) - set(original.namelist()))
        shutil.copyfile(staging, output)
manifest = {'commit': commit, 'base_commit': original_commit,
            'base_sha256': hashlib.sha256(base.read_bytes()).hexdigest(),
            'output_sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
            'javac': subprocess.check_output([args.javac, '-version'], text=True).strip(),
            'changed_entries': changed, 'added_entries': added}
output.with_suffix('.build.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(manifest, indent=2))
