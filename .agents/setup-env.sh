#!/usr/bin/env bash
set -euo pipefail

repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
toolchain="$repo/.agents/.toolchain"
mkdir -p "$toolchain"
staging="$(mktemp -d "$toolchain/setup.XXXXXXXX")"
trap 'rm -rf -- "$staging"' EXIT

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

require_linux_x64() {
  [[ "$(uname -s)" == Linux && "$(uname -m)" == x86_64 ]] ||
    fail "Automatic installation requires Linux x86_64. Configure the required tools before running this script."
}

download() {
  local url="$1" filename="$2" checksum="$3" check="$4"
  curl --fail --silent --show-error --location --retry 2 "$url" -o "$staging/$filename"
  printf '%s  %s\n' "$checksum" "$staging/$filename" | "$check" --check --status ||
    fail "Checksum verification failed for $filename."
}

java_21() {
  [[ -x "$1/bin/java" && -x "$1/bin/javac" ]] &&
    "$1/bin/java" -version 2>&1 | grep -E '^.*version "21([.+"-]|$)' >/dev/null
}

if [[ -n "${JAVA_HOME:-}" ]]; then
  java_21 "$JAVA_HOME" || fail "JAVA_HOME must point to a JDK 21 installation."
else
  java_command="$(command -v javac || true)"
  if [[ -n "$java_command" ]]; then
    path_jdk="$(cd -- "$(dirname -- "$(realpath -- "$java_command")")/.." && pwd)"
  fi
  if [[ -n "${path_jdk:-}" ]] && java_21 "$path_jdk"; then
    JAVA_HOME="$path_jdk"
  else
    JAVA_HOME="$toolchain/jdk-21"
    if ! java_21 "$JAVA_HOME"; then
      require_linux_x64
      jdk_archive="OpenJDK21U-jdk_x64_linux_hotspot_21.0.13.1_2.tar.gz"
      download "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.13.1%2B2/$jdk_archive" \
        "$jdk_archive" bb8a93f9ae6e7a693b2b721e85dbeff26ae1a77447985a8d7afcdd9c7cf6222e sha256sum
      mkdir "$staging/jdk"
      tar -xzf "$staging/$jdk_archive" --strip-components=1 -C "$staging/jdk"
      mv -T -- "$staging/jdk" "$JAVA_HOME"
    fi
  fi
fi
export JAVA_HOME
export PATH="$JAVA_HOME/bin:$PATH"

node_22_or_newer() {
  "$1" -e 'process.exit(Number(process.versions.node.split(".")[0]) < 22 ? 1 : 0)' 2>/dev/null
}

if ! node_22_or_newer node; then
  if ! node_22_or_newer "$toolchain/node-22/bin/node"; then
    require_linux_x64
    node_archive="node-v22.22.2-linux-x64.tar.xz"
    download "https://nodejs.org/dist/v22.22.2/$node_archive" "$node_archive" \
      88fd1ce767091fd8d4a99fdb2356e98c819f93f3b1f8663853a2dee9b438068a sha256sum
    mkdir "$staging/node"
    tar -xJf "$staging/$node_archive" --strip-components=1 -C "$staging/node"
    mv -T -- "$staging/node" "$toolchain/node-22"
  fi
  export PATH="$toolchain/node-22/bin:$PATH"
fi

# Gradle gives sdk.dir priority over the environment. Honor an existing local.properties.
configured_sdk=""
if [[ -f "$repo/local.properties" ]]; then
  configured_sdk="$(sed -n 's/^[[:space:]]*sdk\.dir[[:space:]]*=[[:space:]]*//p' "$repo/local.properties" | tail -n 1)"
  if [[ -n "$configured_sdk" && "$configured_sdk" != /* ]]; then
    configured_sdk="$repo/$configured_sdk"
  fi
fi
configured_sdk="${configured_sdk:-${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}}"
export ANDROID_HOME="${configured_sdk:-$toolchain/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ANDROID_USER_HOME="${ANDROID_USER_HOME:-$toolchain/android-user}"
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$toolchain/gradle}"

# Apply the inherited proxy and CA only to child processes in this invocation.
proxy_settings="$(node - <<'JS'
function proxy(scheme) {
  const value = process.env[scheme + '_PROXY'] || process.env[scheme.toLowerCase() + '_proxy'];
  if (!value) return new URL('http://localhost:80');
  return new URL(value.includes('://') ? value : 'http://' + value);
}
const http = proxy('HTTP');
const https = proxy('HTTPS');
for (const [scheme, url] of [['HTTP', http], ['HTTPS', https]]) {
  const configured = process.env[scheme + '_PROXY'] || process.env[scheme.toLowerCase() + '_proxy'];
  console.log(configured ? url.hostname : '');
  console.log(url.port || (url.protocol === 'https:' ? '443' : '80'));
}
const bypass = (process.env.NO_PROXY || process.env.no_proxy || '').split(',')
  .map(host => host.trim()).filter(host => host && !host.includes('/') && !host.includes(':'))
  .map(host => host.startsWith('.') ? '*' + host : host);
console.log([...new Set(['localhost', '127.0.0.1', ...bypass])].join('|'));
JS
)"
mapfile -t proxy_parts <<< "$proxy_settings"
sdk_proxy=()
java_options=()
if [[ -n "${proxy_parts[0]:-}" ]]; then
  java_options+=("-Dhttp.proxyHost=${proxy_parts[0]}" "-Dhttp.proxyPort=${proxy_parts[1]}")
fi
if [[ -n "${proxy_parts[2]:-}" ]]; then
  java_options+=("-Dhttps.proxyHost=${proxy_parts[2]}" "-Dhttps.proxyPort=${proxy_parts[3]}")
fi
if (( ${#java_options[@]} )); then
  java_options+=("-Dhttp.nonProxyHosts=${proxy_parts[4]}")
  if [[ -n "${proxy_parts[2]:-}" ]]; then
    sdk_proxy=(--proxy=http "--proxy_host=${proxy_parts[2]}" "--proxy_port=${proxy_parts[3]}")
  else
    sdk_proxy=(--proxy=http "--proxy_host=${proxy_parts[0]}" "--proxy_port=${proxy_parts[1]}")
  fi
  if [[ "${JAVA_TOOL_OPTIONS:-}" != *-Djavax.net.ssl.trustStore=* ]]; then
    trust_store="$JAVA_HOME/lib/security/cacerts"
    if [[ -r /etc/ssl/certs/java/cacerts ]]; then
      trust_store=/etc/ssl/certs/java/cacerts
    fi
    # Keep an explicitly configured CA bundle separate from the JDK's trust store.
    if [[ -r "${SSL_CERT_FILE:-}" ]] &&
       { [[ "$trust_store" != /etc/ssl/certs/java/cacerts ]] || ! cmp -s "$SSL_CERT_FILE" /etc/ssl/certs/ca-certificates.crt; }; then
      fingerprints="$(sha256sum "$trust_store" "$SSL_CERT_FILE" | sha256sum)"
      scoped_trust_store="$toolchain/cacerts-${fingerprints%% *}"
      if [[ ! -r "$scoped_trust_store" ]]; then
        cp -- "$trust_store" "$staging/cacerts"
        awk -v directory="$staging" '
          /-----BEGIN CERTIFICATE-----/ { output = directory "/ca-" ++number ".pem" }
          output { print > output }
          /-----END CERTIFICATE-----/ { close(output); output = "" }
        ' "$SSL_CERT_FILE"
        for cert in "$staging"/ca-*.pem; do
          [[ -f "$cert" ]] || continue
          "$JAVA_HOME/bin/keytool" -importcert -noprompt -alias "ribit-$(basename "$cert")" \
            -file "$cert" -keystore "$staging/cacerts" -storepass changeit >/dev/null
        done
        mv -T -- "$staging/cacerts" "$scoped_trust_store"
      fi
      trust_store="$scoped_trust_store"
    fi
    java_options+=("-Djavax.net.ssl.trustStore=\"$trust_store\"")
  fi
  if [[ -r "${SSL_CERT_FILE:-}" && -z "${NODE_EXTRA_CA_CERTS:-}" ]]; then
    export NODE_EXTRA_CA_CERTS="$SSL_CERT_FILE"
  fi
  export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:+$JAVA_TOOL_OPTIONS }${java_options[*]}"
fi

if [[ ! -f "$ANDROID_HOME/platforms/android-36/android.jar" ||
      ! -x "$ANDROID_HOME/build-tools/35.0.0/aapt2" ||
      ! -x "$ANDROID_HOME/platform-tools/adb" ]]; then
  [[ -z "$configured_sdk" ]] ||
    fail "The configured Android SDK needs Platform 36, Build-Tools 35.0.0 and Platform-Tools. Install them with Android Studio or sdkmanager."
  require_linux_x64
  sdk_tools="$ANDROID_HOME/cmdline-tools/19.0"
  if [[ ! -x "$sdk_tools/bin/sdkmanager" ]]; then
    sdk_archive="commandlinetools-linux-13114758_latest.zip"
    download "https://dl.google.com/android/repository/$sdk_archive" "$sdk_archive" \
      5fdcc763663eefb86a5b8879697aa6088b041e70 sha1sum
    unzip -q "$staging/$sdk_archive" -d "$staging/android"
    mkdir -p "$ANDROID_HOME/cmdline-tools"
    mv -T -- "$staging/android/cmdline-tools" "$sdk_tools"
  fi
  sdkmanager="$sdk_tools/bin/sdkmanager"
  # sdkmanager closes its input after the final prompt, so yes can receive SIGPIPE.
  (set +o pipefail; yes | "$sdkmanager" "--sdk_root=$ANDROID_HOME" "${sdk_proxy[@]}" --licenses)
  "$sdkmanager" "--sdk_root=$ANDROID_HOME" "${sdk_proxy[@]}" --install \
    "platform-tools" "platforms;android-36" "build-tools;35.0.0"
fi
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/19.0/bin:$PATH"

if (( $# )); then
  "$@"
fi
