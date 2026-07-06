# TAPE / PLAYTAPE launcher v3.1 — serves the chosen app locally and opens it
# in its own window. Pass "playtape" as an argument for PLAYTAPE.
# Hardened: no port squatting, reuses a healthy running server, health-checks
# itself, falls back to file:// if serving misbehaves, logs every run to
# launcher.log beside this file.
import http.server
import socketserver
import threading
import subprocess
import os
import sys
import functools
import webbrowser
import time
import ctypes
import urllib.request

BASE = os.path.dirname(os.path.abspath(__file__))
IS_PLAY = 'playtape' in [a.lower() for a in sys.argv[1:]]
APP_TITLE = 'PLAYTAPE' if IS_PLAY else 'TAPE'
APP_DIR = os.path.join(BASE, 'playtape' if IS_PLAY else 'app')
INDEX = os.path.join(APP_DIR, 'index.html')
MARK = 'PLAYTAPE' if IS_PLAY else 'TAPE — multitrack recorder'
PORT0 = 8815 if IS_PLAY else 8765          # separate ranges so both can run
DATA_DIR = os.path.join(os.environ.get('LOCALAPPDATA', BASE), 'TAPE')
PROFILE = os.path.join(DATA_DIR, 'browser-profile-playtape' if IS_PLAY else 'browser-profile')


def log(msg):
    try:
        with open(os.path.join(BASE, 'launcher.log'), 'a', encoding='utf-8') as f:
            f.write('%s [%s] %s | argv=%r\n' % (
                time.strftime('%Y-%m-%d %H:%M:%S'), APP_TITLE, msg, sys.argv))
    except Exception:
        pass


def alert(msg):
    log('ALERT: ' + msg.replace('\n', ' '))
    try:
        ctypes.windll.user32.MessageBoxW(0, msg, APP_TITLE, 0x10)
    except Exception:
        pass


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):  # pythonw has no console; stderr writes raise
        pass


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = False   # on Windows, True lets us bind a busy port
    daemon_threads = True


def probe(port, timeout=1.5):
    try:
        with urllib.request.urlopen(
                'http://127.0.0.1:%d/index.html' % port, timeout=timeout) as r:
            return MARK in r.read(4096).decode('utf-8', 'replace')
    except Exception:
        return False


def start_server():
    handler = functools.partial(QuietHandler, directory=APP_DIR)
    for port in range(PORT0, PORT0 + 50):
        if probe(port, 0.4):
            log('reusing healthy server on %d' % port)
            return None, port
        try:
            srv = Server(('127.0.0.1', port), handler)
        except OSError:
            continue                    # busy port: move on, never squat
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        if probe(port):
            log('serving %s on %d' % (APP_DIR, port))
            return srv, port
        srv.shutdown()
        log('bound %d but self-probe failed' % port)
        return None, None
    log('no usable port in %d-%d' % (PORT0, PORT0 + 49))
    return None, None


def find_browser():
    pf = os.environ.get('ProgramFiles', r'C:\Program Files')
    pf86 = os.environ.get('ProgramFiles(x86)', r'C:\Program Files (x86)')
    lad = os.environ.get('LocalAppData', '')
    for c in [
        os.path.join(pf, r'Google\Chrome\Application\chrome.exe'),
        os.path.join(pf86, r'Google\Chrome\Application\chrome.exe'),
        os.path.join(lad, r'Google\Chrome\Application\chrome.exe'),
        os.path.join(pf86, r'Microsoft\Edge\Application\msedge.exe'),
        os.path.join(pf, r'Microsoft\Edge\Application\msedge.exe'),
    ]:
        if os.path.exists(c):
            return c
    return None


def open_window(url, wait):
    browser = find_browser()
    log('opening %s via %s' % (url, browser or 'default browser'))
    if browser:
        os.makedirs(PROFILE, exist_ok=True)
        proc = subprocess.Popen([
            browser, '--app=' + url,
            '--user-data-dir=' + PROFILE,
            '--no-first-run', '--no-default-browser-check',
        ])
        if wait:
            proc.wait()
            time.sleep(1)  # let an in-flight download flush
        return True
    webbrowser.open(url)
    return False


def main():
    log('start; APP_DIR=' + APP_DIR)
    try:
        with open(INDEX, 'rb') as f:
            ok = MARK.encode('utf-8') in f.read()
    except OSError:
        ok = False
    if not ok:
        alert(APP_TITLE + ' is damaged or incomplete:\n' + INDEX +
              '\n\nRe-run INSTALL.bat.')
        return

    srv, port = start_server()
    server_only = '--server-only' in sys.argv

    if port is not None:
        url = 'http://127.0.0.1:%d/' % port
        if server_only:
            while True:
                time.sleep(3600)
        if srv is None:
            open_window(url, wait=True)
            return
        waited = open_window(url, wait=True)
        if not waited:
            while True:
                time.sleep(3600)
        srv.shutdown()
        log('window closed; server stopped')
    else:
        if server_only:
            alert(APP_TITLE + ' could not start a local server.')
            return
        # file:// fallback: Chrome treats file:// as a secure context,
        # so mic/recording still work
        open_window('file:///' + INDEX.replace('\\', '/'), wait=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        alert(APP_TITLE + ' failed to start:\n%r' % (e,))
