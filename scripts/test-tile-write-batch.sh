#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
task_test_dir=$(mktemp -d)
trap 'rm -rf "$task_test_dir"' EXIT
javac --release 25 -d "$task_test_dir" \
  core/src/main/java/net/pl3x/map/core/image/FileWriteBatch.java \
  core/src/test/java/net/pl3x/map/core/image/FileWriteBatchTest.java
java -Djava.awt.headless=true -cp "$task_test_dir" net.pl3x.map.core.image.FileWriteBatchTest
