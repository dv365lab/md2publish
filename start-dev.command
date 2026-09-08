#!/bin/zsh

# md2publish one-click launcher for macOS.
# Double-click this file in Finder to install dependencies on the first run,
# start the development server, and open the app in the default browser.

APP_URL='http://127.0.0.1:5173/'
SCRIPT_DIR="${0:A:h}"

pause_on_error() {
  if [[ -t 0 ]]; then
    echo
    echo '按任意键关闭此窗口…'
    read -r -k 1
    echo
  fi
}

if ! cd -- "$SCRIPT_DIR"; then
  echo '[错误] 无法进入 md2publish 项目目录。'
  pause_on_error
  exit 1
fi

# Finder-launched Terminal sessions do not always inherit Homebrew's PATH.
# Keep the user's configured tools first, then add the two standard locations.
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"

# If md2publish is already responding, only open it instead of starting a
# second server. Check the page identity so another service on port 5173 is
# never mistaken for this app.
RUNNING_PAGE="$(/usr/bin/curl --fail --silent --max-time 2 "$APP_URL" 2>/dev/null)"
if [[ "$RUNNING_PAGE" == *'<title>md2publish</title>'* ]]; then
  /usr/bin/open "$APP_URL"
  exit 0
fi

if /usr/sbin/lsof -n -P -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1; then
  echo '[错误] 端口 5173 已被其他程序占用。'
  echo '请关闭占用该端口的程序后，再重新双击 start-dev.command。'
  pause_on_error
  exit 1
fi

NPM_BIN="$(command -v npm)"
if [[ -z "$NPM_BIN" ]]; then
  echo '[错误] 未找到 npm。'
  echo '请先安装 Node.js 22 LTS：https://nodejs.org/'
  pause_on_error
  exit 1
fi

if [[ ! -x 'node_modules/.bin/vite' ]]; then
  echo '首次运行：正在安装依赖，请稍候…'
  if ! "$NPM_BIN" install; then
    echo '[错误] npm install 执行失败，请检查上方错误信息。'
    pause_on_error
    exit 1
  fi
fi

echo '正在启动 md2publish…'
echo '使用结束后，在此窗口按 Control+C 即可停止服务。'
exec "$NPM_BIN" run dev
