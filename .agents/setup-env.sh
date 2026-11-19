#!/usr/bin/env bash
set -euo pipefail

JDK_DIR="$HOME/.local/jdk-21"
ANDROID_HOME="$HOME/Android/Sdk"
CMDLINE_TOOLS_URL="https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"

mkdir -p "$HOME/.local" "$HOME/.local/share" "$HOME/.gradle/init.d"

# 1. Install Temurin JDK 21 if not already present.
if [ ! -x "$JDK_DIR/bin/java" ]; then
  case "$(uname -m)" in
    x86_64) ADOPT_ARCH="x64" ;;
    aarch64|arm64) ADOPT_ARCH="aarch64" ;;
    *)
      echo "Unsupported architecture for JDK 21: $(uname -m)" >&2
      exit 1
      ;;
  esac

  TMP_JDK="$(mktemp -d)"
  trap 'rm -rf "${TMP_JDK:-}" "${TMP_SDK:-}"' EXIT
  curl -fsSL "https://api.adoptium.net/v3/binary/latest/21/ga/linux/${ADOPT_ARCH}/jdk/hotspot/normal/eclipse" \
    -o "$TMP_JDK/jdk21.tar.gz"
  tar -xzf "$TMP_JDK/jdk21.tar.gz" -C "$TMP_JDK"
  EXTRACTED="$(find "$TMP_JDK" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  rm -rf "$JDK_DIR"
  mv "$EXTRACTED" "$JDK_DIR"
  rm -rf "$TMP_JDK"
  TMP_JDK=""
fi

# 2. Import local/proxy CA certificates into JDK 21's truststore idempotently.
import_ca_cert() {
  local alias="$1"
  local cert_file="$2"
  "$JDK_DIR/bin/keytool" -delete -alias "$alias" \
    -keystore "$JDK_DIR/lib/security/cacerts" -storepass changeit >/dev/null 2>&1 || true
  "$JDK_DIR/bin/keytool" -importcert -noprompt -trustcacerts -alias "$alias" \
    -file "$cert_file" -keystore "$JDK_DIR/lib/security/cacerts" -storepass changeit >/dev/null 2>&1
}

if [ -d /usr/local/share/ca-certificates ]; then
  for cert in /usr/local/share/ca-certificates/*.crt; do
    [ -f "$cert" ] || continue
    import_ca_cert "local-$(basename "$cert" .crt)" "$cert"
  done
fi

CERT_FILE="${SSL_CERT_FILE:-/etc/ssl/certs/ca-certificates.crt}"
if [ -f "$CERT_FILE" ]; then
  CERT_COUNT="$(grep -c 'BEGIN CERTIFICATE' "$CERT_FILE" || true)"
  if [ "$CERT_COUNT" -ge 1 ] && [ "$CERT_COUNT" -le 10 ]; then
    import_ca_cert "system-ssl-cert-file" "$CERT_FILE"
  fi
fi

export JAVA_HOME="$JDK_DIR"
export ANDROID_HOME
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

# 3. Install Android SDK Command-Line Tools if not already present.
if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  TMP_SDK="$(mktemp -d)"
  trap 'rm -rf "${TMP_JDK:-}" "${TMP_SDK:-}"' EXIT
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  curl -fsSL "$CMDLINE_TOOLS_URL" -o "$TMP_SDK/cmdline-tools.zip"
  unzip -q "$TMP_SDK/cmdline-tools.zip" -d "$TMP_SDK"
  rm -rf "$ANDROID_HOME/cmdline-tools/latest"
  mv "$TMP_SDK/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  rm -rf "$TMP_SDK"
  TMP_SDK=""
fi

# 4. Install required Android SDK packages (Platform 36, Build-Tools 35.0.0, Platform-Tools).
if [ ! -x "$ANDROID_HOME/platform-tools/adb" ] \
  || [ ! -f "$ANDROID_HOME/platforms/android-36/android.jar" ] \
  || [ ! -x "$ANDROID_HOME/build-tools/35.0.0/aapt2" ] \
  || [ ! -f "$ANDROID_HOME/licenses/android-sdk-license" ]; then
  PROXY_ARGS=()
  PROXY_VAL="${HTTPS_PROXY:-${https_proxy:-${HTTP_PROXY:-${http_proxy:-}}}}"
  if [ -n "$PROXY_VAL" ]; then
    P="${PROXY_VAL#http://}"
    P="${P#https://}"
    P="${P%/}"
    P_HOST="${P%:*}"
    P_PORT="${P##*:}"
    if [ -n "$P_HOST" ] && [ -n "$P_PORT" ] && [ "$P_HOST" != "$P_PORT" ]; then
      PROXY_ARGS=(--proxy=http --proxy_host="$P_HOST" --proxy_port="$P_PORT")
    fi
  fi

  yes | sdkmanager --sdk_root="$ANDROID_HOME" "${PROXY_ARGS[@]}" --licenses >/dev/null 2>&1 || true
  sdkmanager --sdk_root="$ANDROID_HOME" "${PROXY_ARGS[@]}" --install \
    "platform-tools" "platforms;android-36" "build-tools;35.0.0"
fi

# 5. Forward HTTP(S)_PROXY to Gradle wrapper and Gradle daemon when a proxy is active.
cat <<'EOF' > "$HOME/.gradle/init.d/env-proxy.gradle"
def configureProxy = { String scheme, String envVal ->
    if (!envVal) return
    try {
        def uri = new URI(envVal.contains("://") ? envVal : "http://" + envVal)
        if (uri.host) {
            System.setProperty("${scheme}.proxyHost", uri.host)
            if (uri.port > 0) {
                System.setProperty("${scheme}.proxyPort", String.valueOf(uri.port))
            }
        }
    } catch (Exception ignored) {
    }
}
configureProxy("http", System.getenv("HTTP_PROXY") ?: System.getenv("http_proxy"))
configureProxy("https", System.getenv("HTTPS_PROXY") ?: System.getenv("https_proxy"))
def noProxy = System.getenv("NO_PROXY") ?: System.getenv("no_proxy")
if (noProxy) {
    def hosts = noProxy.split(",").collect { it.trim() }.findAll { it }.join("|")
    if (hosts) {
        System.setProperty("http.nonProxyHosts", hosts)
    }
}
EOF

cat <<'EOF' > "$HOME/.local/share/gradle-proxy-env.sh"
_configure_gradle_proxy() {
  local p="${HTTPS_PROXY:-${https_proxy:-${HTTP_PROXY:-${http_proxy:-}}}}"
  [ -n "$p" ] || return 0
  p="${p#http://}"
  p="${p#https://}"
  p="${p%/}"
  local host="${p%:*}"
  local port="${p##*:}"
  if [ -n "$host" ] && [ -n "$port" ] && [ "$host" != "$port" ]; then
    case " ${GRADLE_OPTS:-} " in
      *" -Dhttps.proxyHost="*) ;;
      *) export GRADLE_OPTS="${GRADLE_OPTS:+${GRADLE_OPTS} }-Dhttp.proxyHost=${host} -Dhttp.proxyPort=${port} -Dhttps.proxyHost=${host} -Dhttps.proxyPort=${port} -Dhttp.nonProxyHosts=localhost|127.0.0.1" ;;
    esac
  fi
}
_configure_gradle_proxy
unset -f _configure_gradle_proxy
EOF

# 6. Persist environment variables in ~/.bashrc for interactive and non-interactive shells.
touch "$HOME/.bashrc"
sed -i '/case \$- in/,/esac/d' "$HOME/.bashrc" 2>/dev/null || true

add_bashrc_line() {
  grep -qxF "$1" "$HOME/.bashrc" || echo "$1" >> "$HOME/.bashrc"
}

add_bashrc_line 'export JAVA_HOME="$HOME/.local/jdk-21"'
add_bashrc_line 'export ANDROID_HOME="$HOME/Android/Sdk"'
add_bashrc_line 'export ANDROID_SDK_ROOT="$HOME/Android/Sdk"'
add_bashrc_line 'case ":$PATH:" in *":$JAVA_HOME/bin:"*) ;; *) export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH" ;; esac'
add_bashrc_line '[ -f "$HOME/.local/share/gradle-proxy-env.sh" ] && . "$HOME/.local/share/gradle-proxy-env.sh"'
