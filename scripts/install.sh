#!/bin/sh
# Installs the envy CLI: downloads the right binary for this machine from
# the latest GitHub release, checks it against the published SHA-256, and
# puts it in ~/.local/bin (or $ENVY_INSTALL_DIR).
#
#   curl -fsSL https://raw.githubusercontent.com/thakurdotdev/envy/main/scripts/install.sh | sh
#
# ENVY_VERSION=v0.1.0 picks a version; ENVY_DOWNLOAD_URL overrides where the
# files come from (used by tests).
set -eu

repo="thakurdotdev/envy"
install_dir="${ENVY_INSTALL_DIR:-$HOME/.local/bin}"

fail() {
  echo "✖ $1" >&2
  exit 1
}

case "$(uname -s)" in
  Linux) os="linux" ;;
  Darwin) os="darwin" ;;
  *) fail "This script supports Linux and macOS. On Windows, download envy-windows-x64.exe from https://github.com/$repo/releases." ;;
esac
case "$(uname -m)" in
  x86_64 | amd64) arch="x64" ;;
  arm64 | aarch64) arch="arm64" ;;
  *) fail "Unsupported processor: $(uname -m)." ;;
esac
file="envy-$os-$arch"

if [ -n "${ENVY_DOWNLOAD_URL:-}" ]; then
  base="$ENVY_DOWNLOAD_URL"
elif [ -n "${ENVY_VERSION:-}" ]; then
  base="https://github.com/$repo/releases/download/$ENVY_VERSION"
else
  base="https://github.com/$repo/releases/latest/download"
fi

if command -v sha256sum >/dev/null 2>&1; then
  hash_file() { sha256sum "$1" | cut -d ' ' -f 1; }
elif command -v shasum >/dev/null 2>&1; then
  hash_file() { shasum -a 256 "$1" | cut -d ' ' -f 1; }
else
  fail "Need sha256sum or shasum to check the download."
fi

temporary="$(mktemp -d)"
trap 'rm -rf "$temporary"' EXIT

echo "Downloading $file…"
curl -fsSL "$base/$file" -o "$temporary/$file" || fail "Could not download $base/$file."
curl -fsSL "$base/checksums.txt" -o "$temporary/checksums.txt" || fail "Could not download the checksums."

expected="$(awk -v name="$file" '$2 == name { print $1 }' "$temporary/checksums.txt")"
actual="$(hash_file "$temporary/$file")"
[ -n "$expected" ] || fail "checksums.txt has no entry for $file."
[ "$expected" = "$actual" ] || fail "The download does not match its published checksum. Nothing was installed."

mkdir -p "$install_dir"
chmod +x "$temporary/$file"
mv "$temporary/$file" "$install_dir/envy"
echo "✔ Installed envy to $install_dir/envy"

case ":$PATH:" in
  *":$install_dir:"*) echo "Next: run envy login" ;;
  *) echo "Add $install_dir to your PATH, then run envy login" ;;
esac
