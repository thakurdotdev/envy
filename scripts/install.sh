#!/bin/sh
# Installs or updates the envy CLI: downloads the right binary for this
# machine from GitHub releases, checks it against the published SHA-256,
# and puts it in ~/.local/bin (or $ENVY_INSTALL_DIR).
#
#   curl -fsSL https://envy.thakur.dev/install.sh | sh
#
# ENVY_VERSION=0.1.0 picks a version. ENVY_FORCE=1 reinstalls the same
# version. ENVY_DOWNLOAD_URL overrides where the files come from (tests).
#
# After a successful install it sends one anonymous count: install or update,
# the version, OS, CPU and whether it ran in CI. Nothing else. DO_NOT_TRACK=1
# or ENVY_NO_ANALYTICS=1 turns it off.
set -eu

repo="thakurdotdev/envy"
install_dir="${ENVY_INSTALL_DIR:-$HOME/.local/bin}"
target="$install_dir/envy"

# Colours and the progress bar only when a person is watching.
if [ -t 2 ] && [ -z "${NO_COLOR:-}" ]; then
  bold="$(printf '\033[1m')" dim="$(printf '\033[2m')" red="$(printf '\033[31m')"
  green="$(printf '\033[32m')" cyan="$(printf '\033[36m')" reset="$(printf '\033[0m')"
else
  bold="" dim="" red="" green="" cyan="" reset=""
fi

step() { printf '%s\n' "${cyan}›${reset} $1" >&2; }
done_step() { printf '%s\n' "${green}✔${reset} $1" >&2; }
fail() {
  printf '%s\n' "${red}✖ $1${reset}" >&2
  exit 1
}

printf '\n%s\n\n' "${bold}envy${reset} ${dim}· share .env files, encrypted${reset}" >&2

# 1. Which binary this machine needs.
case "$(uname -s)" in
  Linux) os="linux" os_label="Linux" ;;
  Darwin) os="darwin" os_label="macOS" ;;
  *) fail "This script supports Linux and macOS. On Windows, download envy-windows-x64.exe from https://github.com/$repo/releases/latest" ;;
esac
case "$(uname -m)" in
  x86_64 | amd64) arch="x64" ;;
  arm64 | aarch64) arch="arm64" ;;
  *) fail "Unsupported processor: $(uname -m)." ;;
esac
file="envy-$os-$arch"
step "Platform: $os_label $arch"

command -v curl >/dev/null 2>&1 || fail "Need curl to download envy."
if command -v sha256sum >/dev/null 2>&1; then
  hash_file() { sha256sum "$1" | cut -d ' ' -f 1; }
elif command -v shasum >/dev/null 2>&1; then
  hash_file() { shasum -a 256 "$1" | cut -d ' ' -f 1; }
else
  fail "Need sha256sum or shasum to check the download."
fi

# 2. Which version to install. "latest" redirects to /tag/v1.2.3.
version="${ENVY_VERSION:-}"
version="${version#v}"
if [ -z "$version" ] && [ -z "${ENVY_DOWNLOAD_URL:-}" ]; then
  latest_url="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$repo/releases/latest")" ||
    fail "Could not reach GitHub to find the latest version."
  version="${latest_url##*/v}"
  case "$version" in
    [0-9]*) ;;
    *) fail "Could not find the latest version on GitHub." ;;
  esac
fi
if [ -n "${ENVY_DOWNLOAD_URL:-}" ]; then
  base="$ENVY_DOWNLOAD_URL"
else
  base="https://github.com/$repo/releases/download/v$version"
fi
label="${version:-(latest)}"

# 3. What is installed now, if anything.
current=""
if [ -x "$target" ]; then
  current="$("$target" --version 2>/dev/null | head -n 1 || true)"
fi
if [ -n "$current" ] && [ "$current" = "$version" ] && [ -z "${ENVY_FORCE:-}" ]; then
  done_step "envy $version is already installed and up to date."
  printf '%s\n' "  ${dim}Reinstall with ENVY_FORCE=1, or update later with: envy upgrade${reset}" >&2
  exit 0
fi
if [ -n "$current" ]; then
  step "Updating envy ${bold}$current${reset} → ${bold}$label${reset}"
else
  step "Installing envy ${bold}$label${reset}"
fi

# 4. Download (with a progress bar in a terminal) and check the hash.
temporary="$(mktemp -d)"
trap 'rm -rf "$temporary"' EXIT
if [ -t 2 ]; then
  progress="--progress-bar"
else
  progress="-sS"
fi
# shellcheck disable=SC2086
curl -fL $progress "$base/$file" -o "$temporary/$file" || fail "Could not download $base/$file."
curl -fsSL "$base/checksums.txt" -o "$temporary/checksums.txt" || fail "Could not download checksums.txt."

expected="$(awk -v name="$file" '$2 == name { print $1 }' "$temporary/checksums.txt")"
[ -n "$expected" ] || fail "checksums.txt has no entry for $file."
[ "$expected" = "$(hash_file "$temporary/$file")" ] ||
  fail "The download does not match its published checksum. Nothing was installed."
done_step "Checksum verified"

# 5. Put it in place in one step, so a running envy is never half-written.
mkdir -p "$install_dir"
chmod +x "$temporary/$file"
mv "$temporary/$file" "$target"
if [ -n "$current" ]; then
  done_step "Updated envy ${bold}$current${reset} → ${bold}$label${reset} in $install_dir"
else
  done_step "Installed envy ${bold}$label${reset} to $install_dir"
fi

# 6. Next steps, including the PATH line for this shell if needed.
printf '\n' >&2
case ":$PATH:" in
  *":$install_dir:"*) ;;
  *)
    case "$(basename "${SHELL:-sh}")" in
      zsh) rc="~/.zshrc" line="export PATH=\"$install_dir:\$PATH\"" ;;
      bash) rc="~/.bashrc" line="export PATH=\"$install_dir:\$PATH\"" ;;
      fish) rc="~/.config/fish/config.fish" line="fish_add_path $install_dir" ;;
      *) rc="your shell's startup file" line="export PATH=\"$install_dir:\$PATH\"" ;;
    esac
    printf '%s\n' "  $install_dir is not on your PATH. Add this line to $rc:" >&2
    printf '\n    %s\n\n' "${bold}$line${reset}" >&2
    printf '%s\n\n' "  Then open a new terminal." >&2
    ;;
esac
if [ -n "$current" ]; then
  printf '%s\n\n' "  ${dim}What's new: https://github.com/$repo/releases${reset}" >&2
else
  printf '%s\n' "  Get started:" >&2
  printf '%s\n' "    ${bold}envy login${reset}   ${dim}sign in with GitHub${reset}" >&2
  printf '%s\n' "    ${bold}envy init${reset}    ${dim}link this project${reset}" >&2
  printf '\n%s\n\n' "  ${dim}Docs: https://envy.thakur.dev/docs${reset}" >&2
fi

# 7. One anonymous count, in the background so it never slows the install.
# ENVY_ANALYTICS_URL overrides where it goes (tests).
opted_out() {
  case "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" in
    "" | 0 | false) return 1 ;;
    *) return 0 ;;
  esac
}
if ! opted_out "${DO_NOT_TRACK:-}" && ! opted_out "${ENVY_NO_ANALYTICS:-}"; then
  installed="$("$target" --version 2>/dev/null | head -n 1 | tr -cd 'A-Za-z0-9.+-')" || installed=""
  event="cli-install"
  [ -n "$current" ] && event="cli-update"
  ci=false
  [ -n "${CI:-}" ] && ci=true
  body="{\"type\":\"event\",\"payload\":{\"website\":\"67b6d992-f2da-46f9-904b-43ec0114349e\",\"hostname\":\"envy.thakur.dev\",\"url\":\"/cli/${event#cli-}\",\"name\":\"$event\",\"data\":{\"version\":\"${installed:-unknown}\",\"os\":\"$os\",\"arch\":\"$arch\",\"ci\":$ci}}}"
  # Umami drops requests whose user agent looks like a bot, and curl's does.
  (curl -fsS -m 5 -X POST -H "Content-Type: application/json" \
    -A "envy-cli/${installed:-unknown} ($os; $arch)" --data "$body" \
    "${ENVY_ANALYTICS_URL:-https://analytics.thakur.dev}/api/send" >/dev/null 2>&1 &)
  printf '%s\n\n' "  ${dim}Counted this install anonymously (version, OS and CPU). Opt out: DO_NOT_TRACK=1${reset}" >&2
fi
