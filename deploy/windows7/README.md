TASNEEM PHARMACY POS - WINDOWS 7 PACKAGE
========================================

This package runs Tasneem Pharmacy POS on a Windows 7 PC (Service Pack 1, 64-bit).
The whole POS is one small program; it does not need the internet once installed.

IMPORTANT: Windows 7 no longer gets security updates from Microsoft, and two of the
programs below are community-made builds, not official ones. Use this PC only for the
POS: no email, no web browsing, no USB sticks from unknown people. Plan to move to
Windows 10/11 or Linux when you can (the same app runs there with official software).


WHAT THE PC NEEDS
-----------------
- Windows 7 Service Pack 1, 64-bit (Start > right-click Computer > Properties shows
  "Service Pack 1" and "64-bit Operating System").
- About 1 GB free disk space.


STEP 1 - Install Python 3.12 for Windows 7 (one time)
-----------------------------------------------------
Official Python no longer installs on Windows 7. Use the community build:

  https://github.com/adang1345/PythonWin7

1. Download the 64-bit installer for Python 3.12 (the file name ends in "-amd64.exe").
2. Run it. TICK "Add python.exe to PATH" at the bottom of the first screen.
3. Click "Install Now".

If the installer says a Windows update is missing, the message names it (for example
KB2533623). Download that update from the Microsoft Update Catalog
(https://www.catalog.update.microsoft.com), install it, restart, and run the Python
installer again.


STEP 2 - Install the Supermium browser (one time)
-------------------------------------------------
Chrome and Firefox stopped updating on Windows 7 and cannot show the POS screens
correctly. Supermium is an up-to-date Chrome-based browser made for Windows 7:

  https://github.com/win32ss/supermium/releases

Download the 64-bit installer (the file name contains "x64" and "setup") and run it.
The POS finds Supermium by itself and opens in its own clean window.


STEP 3 - Install the POS
------------------------
1. Copy TasneemPOS-Win7.zip to the PC.
2. Right-click it > "Extract All..." > choose  C:\  > Extract.
   You now have the folder  C:\TasneemPOS-Win7
3. Open that folder and double-click  Setup.cmd
4. When asked, choose the OWNER USERNAME and PASSWORD you will sign in with.
5. Wait for "Setup complete." and press a key to close the window.

Setup also:
- puts "Tasneem POS" and "Stop Tasneem POS" on the desktop,
- makes the POS start by itself when Windows logs in,
- schedules a database backup every night at 22:00.


DAILY USE
---------
Open the POS ......... double-click "Tasneem POS" on the desktop
                       (first start can take up to a minute on an older PC)
Close the POS ........ double-click "Stop Tasneem POS" (or just shut the PC down)
Back up now .......... double-click "Backup now.cmd" in C:\TasneemPOS-Win7
Back up to a USB ..... open a Command Prompt in C:\TasneemPOS-Win7 and type:
                         "Backup now.cmd" --dest E:\POS-Backups
                       (E: = your USB drive letter)
Forgot a password .... double-click "Reset password.cmd"

The POS address is  http://127.0.0.1:8000/  if you ever need to type it.


WHERE YOUR DATA IS
------------------
Everything that matters is OUTSIDE the app folder, so replacing the app never touches it:

  Database ...... C:\ProgramData\TasneemPOS\data\pos.sqlite3
  Backups ....... C:\ProgramData\TasneemPOS\backups\   (newest 30 kept)
  Logs .......... C:\ProgramData\TasneemPOS\logs\
  Settings ...... C:\ProgramData\TasneemPOS\pos.env   (written by Setup.cmd)

C:\ProgramData is hidden: type it into the Windows Explorer address bar to open it.

Copy the backups folder to a USB drive every week. A backup on the same PC does not
help if the hard disk dies.

To restore a backup: stop the POS, copy the chosen  pos_YYYY-MM-DD_HHMM.sqlite3  over
C:\ProgramData\TasneemPOS\data\pos.sqlite3 , start the POS.


UPDATING THE POS
----------------
1. Stop the POS.
2. Delete the old C:\TasneemPOS-Win7 folder and extract the new zip in its place.
3. Double-click Setup.cmd again. Your data, logins and settings are kept.


TROUBLESHOOTING
---------------
"Python 3.12 for Windows 7 is not installed yet"
    Do STEP 1, then run Setup.cmd again. If you just installed Python, restart the PC first.

The POS opens in Internet Explorer / looks broken
    Install Supermium (STEP 2). Then open the POS again from the desktop.

"Port 8000 is used by another program"
    Restart the PC.

"Tasneem POS could not start" / "is taking too long"
    Restart the PC and try once more. If it still fails, send the newest files from
    C:\ProgramData\TasneemPOS\logs\ to your technician.

Setup options (for technicians), from a Command Prompt in this folder:
    py -3.12 pos.py setup --port 8000 --pharmacy-name "Tasneem Pharmacy" --time-zone Asia/Karachi
                          --backup-time 22:00 [--no-shortcuts]
    py -3.12 pos.py status | uninstall
