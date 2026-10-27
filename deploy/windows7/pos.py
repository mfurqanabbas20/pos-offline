"""Tasneem Pharmacy POS - launcher for the Windows 7 package.

Runs on Windows 7 SP1 64-bit with the community Python 3.12 build for Windows 7, using only the
standard library (PowerShell on Windows 7 lacks the cmdlets the Windows 10 scripts rely on).

The whole POS is ONE process: Waitress serves the Django API *and* the pre-built app screens, so no
Node.js is needed on the PC.

    pos.py setup            one-time setup (re-run after updating the app)
    pos.py start            start in the background and open the app
    pos.py stop             stop it
    pos.py backup [--dest]  copy the database (also runs nightly and at start if none today)
    pos.py reset-password   set a new password for a login
    pos.py status           is it running?
    pos.py uninstall        remove shortcuts and scheduled backup (data is kept)
    pos.py run              (internal) serve in the foreground
"""

import argparse
import getpass
import json
import os
import secrets
import socket
import sqlite3
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

APP_NAME = 'Tasneem POS'
ROOT = Path(__file__).resolve().parent
APP = ROOT / 'app'
BACKEND = APP / 'backend'
FRONTEND = APP / 'frontend'
WHEELS = APP / 'wheels'
VENV_SCRIPTS = APP / 'venv' / 'Scripts'
VENV_PY = VENV_SCRIPTS / 'python.exe'
VENV_PYW = VENV_SCRIPTS / 'pythonw.exe'
ICON = ROOT / 'tasneem.ico'

# Pharmacy data lives outside the app folder so replacing the app never touches it.
DATA_ROOT = Path(os.environ.get('POS_DATA_ROOT') or Path(os.environ.get('ProgramData', r'C:\ProgramData')) / 'TasneemPOS')
# Settings (including the secret key) live with the data too, so an update keeps them.
ENV_FILE = DATA_ROOT / 'pos.env'
LEGACY_ENV_FILE = BACKEND / '.env.production'  # older packages kept it inside the app folder
DATA, LOGS, BACKUPS, RUN = (DATA_ROOT / d for d in ('data', 'logs', 'backups', 'run'))
SETTINGS = DATA_ROOT / 'settings.json'
DB_FILE = DATA / 'pos.sqlite3'

DETACHED_PROCESS, CREATE_NEW_PROCESS_GROUP, CREATE_NO_WINDOW = 0x00000008, 0x00000200, 0x08000000


# ----------------------------------------------------------------------------------------- helpers

def has_console():
    # pythonw.exe (used by the desktop shortcuts) has no stdout at all; python.exe always has one.
    return sys.stdout is not None


def say(message):
    if sys.stdout is not None:
        print(message, flush=True)


def ok(message):
    say(f'    [ok] {message}')


def step(message):
    say(f'\n==> {message}')


def alert(message, error=False):
    """Console message, or a Windows message box when started from a shortcut (pythonw, no console)."""
    if has_console():
        say(('\n[x] ' if error else '') + message)
    else:
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, message, APP_NAME, 0x10 if error else 0x40)


def fail(message):
    alert(message, error=True)
    sys.exit(1)


def read_settings():
    if not SETTINGS.exists():
        fail("Tasneem POS is not set up yet. Double-click 'Setup.cmd' first.")
    return json.loads(SETTINGS.read_text(encoding='utf-8'))


def backend_env():
    env = dict(os.environ)
    env.update({
        'POS_ENV_FILE': str(ENV_FILE),
        'POS_FRONTEND_DIR': str(FRONTEND),
        'LOG_DIR': str(LOGS),
        'DJANGO_SETTINGS_MODULE': 'config.settings',
        'PYTHONUTF8': '1',
    })
    return env


def manage(*args):
    result = subprocess.run([str(VENV_PY), 'manage.py', *args], cwd=BACKEND, env=backend_env())
    if result.returncode != 0:
        fail(f"'manage.py {' '.join(args)}' failed. See the messages above.")


def django_code(code, extra_env=None):
    """Run a snippet with Django set up (inside the app's own Python)."""
    env = backend_env()
    env.update(extra_env or {})
    prelude = 'import django,os,sys;django.setup();'
    return subprocess.run([str(VENV_PY), '-c', prelude + code], cwd=BACKEND, env=env,
                          capture_output=True, text=True)


def port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1)
        return s.connect_ex(('127.0.0.1', port)) == 0


def healthy(port, timeout=3):
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health/', timeout=timeout) as r:
            return r.status == 200
    except Exception:
        return False


def app_url(settings):
    return f"http://127.0.0.1:{settings['port']}/"


def find_browser(settings):
    """Prefer Supermium (a current Chromium for Windows 7); fall back to the default browser."""
    candidates = [settings.get('browser') or '']
    for base in (os.environ.get('ProgramFiles'), os.environ.get('ProgramFiles(x86)'), os.environ.get('ProgramW6432')):
        if base:
            candidates.append(os.path.join(base, 'Supermium', 'chrome.exe'))
    if os.environ.get('LOCALAPPDATA'):
        candidates.append(os.path.join(os.environ['LOCALAPPDATA'], 'Supermium', 'Application', 'chrome.exe'))
    return next((c for c in candidates if c and os.path.isfile(c)), None)


def open_app(settings):
    url = app_url(settings)
    browser = find_browser(settings)
    if browser:
        # --app opens a clean window without tabs/address bar, so it feels like a normal program.
        subprocess.Popen([browser, f'--app={url}', '--start-maximized'], close_fds=True)
    else:
        os.startfile(url)


def vbs_string(text):
    return '"' + text.replace('"', '""') + '"'


def make_shortcut(path, target, arguments, description):
    """Create a .lnk via Windows Script Host (present on every Windows 7 PC)."""
    script = '\r\n'.join([
        'Set s = CreateObject("WScript.Shell")',
        f'Set l = s.CreateShortcut({vbs_string(str(path))})',
        f'l.TargetPath = {vbs_string(str(target))}',
        f'l.Arguments = {vbs_string(arguments)}',
        f'l.WorkingDirectory = {vbs_string(str(ROOT))}',
        f'l.Description = {vbs_string(description)}',
        *([f'l.IconLocation = {vbs_string(str(ICON))}'] if ICON.exists() else []),
        'l.Save',
    ])
    vbs = RUN / 'shortcut.vbs'
    vbs.write_text(script, encoding='utf-16')
    subprocess.run(['cscript', '//nologo', str(vbs)], check=True, creationflags=CREATE_NO_WINDOW)
    vbs.unlink()


def desktop_dir():
    return Path(os.environ.get('USERPROFILE', '')) / 'Desktop'


def startup_dir():
    return Path(os.environ['APPDATA']) / 'Microsoft' / 'Windows' / 'Start Menu' / 'Programs' / 'Startup'


def ensure_venv_python():
    """Everything except setup must run inside the app's own Python; re-launch there if needed."""
    if Path(sys.executable).resolve().parent != VENV_SCRIPTS.resolve():
        if not VENV_PY.exists():
            fail("Tasneem POS is not set up yet. Double-click 'Setup.cmd' first.")
        exe = VENV_PY if has_console() else VENV_PYW
        sys.exit(subprocess.call([str(exe), str(Path(__file__)), *sys.argv[1:]]))


# ----------------------------------------------------------------------------------------- setup

def cmd_setup(args):
    say(f'{APP_NAME} - setup for Windows 7')
    say(f'    App folder:  {ROOT}')
    say(f'    Data folder: {DATA_ROOT}')

    step('Checking Python')
    if sys.version_info < (3, 12):
        fail('Python 3.12 or newer is needed. Install "Python 3.12 for Windows 7" (see README), then run Setup again.')
    if sys.maxsize <= 2 ** 32:
        fail('Please install the 64-bit Python (the file ending in -amd64.exe).')
    ok(f'Python {sys.version.split()[0]} (64-bit)')
    if not (FRONTEND / 'index.html').exists():
        fail(f'The app screens are missing ({FRONTEND}). Copy the complete package again.')

    for d in (DATA_ROOT, DATA, LOGS, BACKUPS, RUN):
        d.mkdir(parents=True, exist_ok=True)

    step('Installing the app')
    if not VENV_PY.exists():
        subprocess.run([sys.executable, '-m', 'venv', str(APP / 'venv')], check=True)
    pip = [str(VENV_PY), '-m', 'pip', 'install', '--disable-pip-version-check', '--quiet']
    source = ['--no-index', '--find-links', str(WHEELS)] if WHEELS.exists() else []
    if subprocess.run(pip + source + ['-r', str(BACKEND / 'requirements.txt')]).returncode != 0:
        fail('Installing the app packages failed. See the messages above.')
    ok('Installed' + (' (offline, from the package)' if source else ''))

    step('Writing settings')
    secret = None
    for existing in (ENV_FILE, LEGACY_ENV_FILE):
        if existing.exists() and not secret:
            for line in existing.read_text(encoding='utf-8').splitlines():
                if line.startswith('DJANGO_SECRET_KEY='):
                    secret = line.split('=', 1)[1]
    ENV_FILE.write_text('\n'.join([
        '# Production settings for this PC. Written by pos.py setup - run Setup again to change.',
        'DJANGO_DEBUG=false',
        f'DJANGO_SECRET_KEY={secret or secrets.token_urlsafe(50)}',
        'DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1',
        'POS_LOCAL_HTTP=true',
        f'TIME_ZONE={args.time_zone}',
        f'PHARMACY_NAME={args.pharmacy_name}',
        'EXPIRY_WARNING_DAYS=90',
        'JWT_ACCESS_MINUTES=60',
        'JWT_REFRESH_DAYS=7',
        'DB_ENGINE=sqlite',
        f'SQLITE_PATH={DB_FILE}',
        '',
    ]), encoding='utf-8')
    old = json.loads(SETTINGS.read_text(encoding='utf-8')) if SETTINGS.exists() else {}
    settings = {**old, 'port': args.port, 'pharmacy_name': args.pharmacy_name, 'app_folder': str(ROOT),
                'setup_at': datetime.now().isoformat(timespec='seconds')}
    SETTINGS.write_text(json.dumps(settings, indent=2), encoding='utf-8')
    ok(f'Database: {DB_FILE}')

    step('Preparing the database')
    manage('migrate', '--noinput')
    manage('collectstatic', '--noinput', '--verbosity', '0')
    manage('check', '--deploy', '--fail-level', 'WARNING')
    ok('Database ready, production checks passed')

    has_owner = django_code("from django.contrib.auth import get_user_model as g;"
                            "print(g().objects.filter(is_superuser=True).exists())").stdout.strip() == 'True'
    if has_owner:
        ok('An owner login already exists')
    else:
        step('Create the owner login (you will use this to sign in)')
        username = args.owner_username
        while not username:
            username = input('    Choose a username (e.g. tasneem): ').strip()
        password = args.owner_password
        while not password:
            p1 = getpass.getpass('    Choose a password (at least 8 characters): ')
            p2 = getpass.getpass('    Type the password again: ')
            if len(p1) < 8:
                say('    [!] Too short. Use at least 8 characters.')
            elif p1 != p2:
                say('    [!] The two passwords do not match. Try again.')
            else:
                password = p1
        result = django_code(
            "from django.contrib.auth import get_user_model as g;"
            "g().objects.create_superuser(os.environ['POS_OWNER_USERNAME'],'',os.environ['POS_OWNER_PASSWORD'],"
            "first_name=os.environ['POS_OWNER_USERNAME'].capitalize())",
            {'POS_OWNER_USERNAME': username, 'POS_OWNER_PASSWORD': password},
        )
        if result.returncode != 0:
            fail('Could not create the login:\n' + result.stderr[-800:])
        ok(f"Owner login '{username}' created")

    if not args.no_shortcuts:
        install_shortcuts(args.backup_time)

    say('\nSetup complete.')
    say("  Open the POS: double-click 'Tasneem POS' on the desktop (it also starts by itself after login).")
    say(f'  Address:      {app_url(settings)}')


def install_shortcuts(backup_time):
    step('Shortcuts, start at login and nightly backup')
    pos = str(ROOT / 'pos.py')
    desktop = desktop_dir()
    make_shortcut(desktop / 'Tasneem POS.lnk', VENV_PYW, f'"{pos}" start', 'Open Tasneem Pharmacy POS')
    make_shortcut(desktop / 'Stop Tasneem POS.lnk', VENV_PYW, f'"{pos}" stop', 'Stop Tasneem Pharmacy POS')
    ok("Desktop shortcuts: 'Tasneem POS' and 'Stop Tasneem POS'")
    make_shortcut(startup_dir() / 'Tasneem POS.lnk', VENV_PYW, f'"{pos}" start', 'Start Tasneem Pharmacy POS at login')
    ok('Starts automatically when Windows logs in')

    # schtasks limits /TR to 261 characters, so the task runs a short helper file.
    task_cmd = RUN / 'backup-task.cmd'
    task_cmd.write_text(f'@echo off\r\n"{VENV_PYW}" "{pos}" backup\r\n', encoding='ascii')
    result = subprocess.run(
        ['schtasks', '/Create', '/F', '/SC', 'DAILY', '/ST', backup_time, '/TN', 'Tasneem POS - Backup', '/TR', f'"{task_cmd}"'],
        capture_output=True, text=True,
    )
    if result.returncode == 0:
        ok(f'Nightly backup at {backup_time} (and at start-up if a day was missed)')
    else:
        say('    [!] Could not schedule the nightly backup; a backup is still made each day at start-up.')


# ----------------------------------------------------------------------------------------- run / start / stop

def cmd_run(args):
    """Serve the API and the app screens in this process (started hidden by 'start')."""
    settings = read_settings()
    LOGS.mkdir(parents=True, exist_ok=True)
    if sys.stdout is None or sys.stderr is None:  # pythonw: keep output in a log file
        log = open(LOGS / 'server.log', 'a', encoding='utf-8', buffering=1)
        sys.stdout = sys.stderr = log
    os.environ.update(backend_env())
    os.chdir(BACKEND)
    sys.path.insert(0, str(BACKEND))

    import django
    from django.core.management import call_command
    django.setup()
    call_command('migrate', interactive=False, verbosity=0)  # applies updates after replacing the app

    from waitress import serve

    from config.wsgi import application
    print(f'{datetime.now():%Y-%m-%d %H:%M:%S} serving on {app_url(settings)}', flush=True)
    serve(application, listen=f"127.0.0.1:{settings['port']}", threads=6, channel_timeout=120, ident='')


def cmd_start(args):
    settings = read_settings()
    port = settings['port']
    if healthy(port):
        if not args.no_browser:
            open_app(settings)
        return
    if port_in_use(port):
        fail(f'Port {port} is used by another program. Restart the PC, then open Tasneem POS again.')

    for d in (LOGS, RUN):
        d.mkdir(parents=True, exist_ok=True)
    for old in LOGS.glob('start-*.log'):  # keep a month of start logs
        if datetime.fromtimestamp(old.stat().st_mtime) < datetime.now() - timedelta(days=30):
            old.unlink(missing_ok=True)

    log = open(LOGS / f'start-{datetime.now():%Y-%m-%d_%H%M%S}.log', 'ab')
    proc = subprocess.Popen(
        [str(VENV_PYW), str(ROOT / 'pos.py'), 'run'], cwd=ROOT, stdin=subprocess.DEVNULL, stdout=log, stderr=log,
        creationflags=DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP, close_fds=True,
    )
    (RUN / 'server.pid').write_text(str(proc.pid))

    deadline = time.time() + 120  # an older PC can take a while on first start
    while time.time() < deadline:
        if healthy(port):
            break
        if proc.poll() is not None:
            fail(f'Tasneem POS could not start. Details are in:\n{LOGS}')
        time.sleep(1)
    else:
        fail(f'Tasneem POS is taking too long to start. Details are in:\n{LOGS}')

    ok(f'Running at {app_url(settings)}')
    if not args.no_browser:
        open_app(settings)
    # Daily safety copy if the nightly task did not run (PC was off at night).
    latest = max(BACKUPS.glob('pos_*.sqlite3'), key=lambda p: p.stat().st_mtime, default=None)
    if latest is None or datetime.fromtimestamp(latest.stat().st_mtime) < datetime.now() - timedelta(hours=20):
        do_backup(BACKUPS, keep=30, quiet=True)


def cmd_stop(args):
    settings = read_settings()
    pid_file = RUN / 'server.pid'
    if pid_file.exists():
        subprocess.run(['taskkill', '/PID', pid_file.read_text().strip(), '/T', '/F'],
                       capture_output=True, creationflags=CREATE_NO_WINDOW)
        pid_file.unlink(missing_ok=True)
    for _ in range(10):
        if not port_in_use(settings['port']):
            alert('Tasneem POS has stopped.')
            return
        time.sleep(0.5)
    fail(f"Port {settings['port']} is still in use. Restart the PC to stop the POS.")


def cmd_status(args):
    settings = read_settings()
    if healthy(settings['port']):
        alert(f'Tasneem POS is running at {app_url(settings)}')
    else:
        alert('Tasneem POS is not running.')


# ----------------------------------------------------------------------------------------- backup / passwords

def do_backup(destination, keep, quiet=False):
    destination.mkdir(parents=True, exist_ok=True)
    target = destination / f'pos_{datetime.now():%Y-%m-%d_%H%M}.sqlite3'
    # SQLite's backup API copies a consistent snapshot even while sales are being saved.
    src = sqlite3.connect(DB_FILE)
    dst = sqlite3.connect(target)
    with dst:
        src.backup(dst)
    dst.close()
    src.close()
    for old in sorted(destination.glob('pos_*.sqlite3'), key=lambda p: p.stat().st_mtime, reverse=True)[keep:]:
        old.unlink(missing_ok=True)
    if not quiet:
        ok(f'Backup saved: {target} ({target.stat().st_size // 1024} KB)')
    return target


def cmd_backup(args):
    read_settings()
    if not DB_FILE.exists():
        fail(f'No database found at {DB_FILE}.')
    target = do_backup(Path(args.dest) if args.dest else BACKUPS, args.keep, quiet=not has_console())
    if not has_console() and args.dest:
        alert(f'Backup saved:\n{target}')


def cmd_reset_password(args):
    read_settings()
    names = django_code("from django.contrib.auth import get_user_model as g;"
                        "print(','.join(g().objects.order_by('username').values_list('username',flat=True)))")
    known = [n for n in names.stdout.strip().split(',') if n]
    username = args.username
    while not username:
        username = input('Username to reset: ').strip()
    if username not in known:
        fail(f"There is no login called '{username}'. Logins on this PC: {', '.join(known)}")
    while True:
        p1 = getpass.getpass('New password (at least 8 characters): ')
        p2 = getpass.getpass('Type it again: ')
        if len(p1) < 8:
            say('[!] Too short.')
        elif p1 != p2:
            say('[!] The two passwords do not match.')
        else:
            break
    result = django_code(
        "from django.contrib.auth import get_user_model as g;"
        "u=g().objects.get(username=os.environ['POS_OWNER_USERNAME']);"
        "u.set_password(os.environ['POS_OWNER_PASSWORD']);u.save(update_fields=['password'])",
        {'POS_OWNER_USERNAME': username, 'POS_OWNER_PASSWORD': p1},
    )
    if result.returncode != 0:
        fail('Could not change the password:\n' + result.stderr[-800:])
    ok(f"Password changed for '{username}'.")


def cmd_uninstall(args):
    for lnk in (desktop_dir() / 'Tasneem POS.lnk', desktop_dir() / 'Stop Tasneem POS.lnk', startup_dir() / 'Tasneem POS.lnk'):
        if lnk.exists():
            lnk.unlink()
            ok(f'Removed {lnk.name}')
    subprocess.run(['schtasks', '/Delete', '/F', '/TN', 'Tasneem POS - Backup'], capture_output=True)
    ok('Removed the nightly backup task')
    say(f'Your data in {DATA_ROOT} was not changed.')


# ----------------------------------------------------------------------------------------- main

def main():
    parser = argparse.ArgumentParser(prog='pos.py', description=f'{APP_NAME} launcher for Windows 7')
    sub = parser.add_subparsers(dest='command', required=True)

    p = sub.add_parser('setup', help='one-time setup (safe to run again)')
    p.add_argument('--port', type=int, default=8000)
    p.add_argument('--pharmacy-name', default='Tasneem Pharmacy')
    p.add_argument('--time-zone', default='Asia/Karachi')
    p.add_argument('--backup-time', default='22:00')
    p.add_argument('--no-shortcuts', action='store_true', help='skip desktop/startup shortcuts and the backup task')
    p.add_argument('--owner-username', default='')
    p.add_argument('--owner-password', default='')
    p.set_defaults(func=cmd_setup)

    p = sub.add_parser('start', help='start and open the app')
    p.add_argument('--no-browser', action='store_true')
    p.set_defaults(func=cmd_start)
    sub.add_parser('stop', help='stop the POS').set_defaults(func=cmd_stop)
    sub.add_parser('status', help='is it running?').set_defaults(func=cmd_status)
    sub.add_parser('run', help='(internal) serve in the foreground').set_defaults(func=cmd_run)
    p = sub.add_parser('backup', help='copy the database')
    p.add_argument('--dest', default='')
    p.add_argument('--keep', type=int, default=30)
    p.set_defaults(func=cmd_backup)
    p = sub.add_parser('reset-password', help='set a new password for a login')
    p.add_argument('--username', default='')
    p.set_defaults(func=cmd_reset_password)
    sub.add_parser('uninstall', help='remove shortcuts and the backup task').set_defaults(func=cmd_uninstall)

    args = parser.parse_args()
    if args.command != 'setup':
        ensure_venv_python()
    args.func(args)


if __name__ == '__main__':
    main()
