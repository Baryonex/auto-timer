# Auto Timer

**A Quick Settings timer for GNOME that closes your chosen apps and then shuts down, restarts or suspends your computer, after a countdown or at a time you set.**

Auto Timer adds one tile to the GNOME Quick Settings panel (next to Wi-Fi, Night Light, Dark Style…). Tick the apps you want closed, pick what should happen to the system, choose *when*, and switch the tile on. That's it.

<!-- Add a screenshot of the open menu here, e.g.: -->
<!-- ![Auto Timer menu](screenshots/menu.png) -->

## Features

- **Close chosen apps.** Pick from the apps that are running right now. They are closed gracefully, exactly as if you had clicked the close button on each window.
- **Then shut down, restart or suspend.** Or do nothing and only close the apps.
- **Two ways to set the time**
  - **Countdown:** presets from 5 minutes to 3 hours, or any number of minutes you type in (1–1440).
  - **Set clock:** a time of day with simple − / + buttons. If that time has already passed today, it means tomorrow, and the menu tells you which.
- **Always visible.** While the timer runs, an alarm icon with the remaining time appears in the top bar, and the tile shows it too.
- **Warning before it happens.** You get a notification one minute before the action. Switch the tile off at any moment to cancel.
- **A menu that stays put.** Ticking several apps in a row doesn't close the panel, and opening one section collapses the others so the menu stays short.
- **Works while the screen is locked.** The timer keeps running when the screen locks.
- **Remembers your choices.** Action, countdown length and clock time are saved between sessions.
- **No network, no telemetry.** Everything stays on your computer.


## Using it

1. Open **Quick Settings** (top-right corner) and click the arrow on the **Auto Timer** tile.
2. **Apps to close:** switch on the apps you want closed when the timer ends.
3. **Then:** choose *Do nothing*, *Shut down*, *Restart* or *Suspend*.
4. **When:** open **Countdown** and pick a preset or type minutes, **or** open **Set clock** and choose a time. A ● marks which of the two is active.
5. Click the **tile** to start. Click it again to cancel.

### What happens when the timer ends

1. The apps you ticked are asked to quit.
2. If a system action is chosen, it runs **6 seconds later**, to give the apps time to close.
3. If no apps are ticked, the system action runs immediately.
4. If *Then* is set to *Do nothing*, only the apps are closed.

If you start the timer with no apps ticked and *Then: Do nothing*, nothing could happen, so you get a notification instead of a silent timer.

## Requirements

- GNOME Shell **45 or newer** (the extension uses the modern ES-module API). The supported versions are listed in `metadata.json`.
- Standard desktop permissions to shut down, restart and suspend (the same ones the power menu uses). Nothing extra needs to be installed.

## Installation

### From extensions.gnome.org

search for **Auto Timer** on <https://extensions.gnome.org> and switch it on.

### From the zip file

```bash
gnome-extensions install --force auto-timer.zip
```

Then **log out and back in** (on Wayland, GNOME only loads new extension code at login) and enable it:

```bash
gnome-extensions enable auto-timer@local
```

You can also enable it from the **Extensions** app.

### From source

```bash
git clone https://github.com/aymanaymaanaa11-a11y/auto-timer.git
cd auto-timer
mkdir -p ~/.local/share/gnome-shell/extensions/auto-timer@local
cp metadata.json extension.js ~/.local/share/gnome-shell/extensions/auto-timer@local/
```

Log out and back in, then enable the extension as above. (The folder name must match the `uuid` in `metadata.json`.)

## Good to know

- **One-shot.** The timer runs once. It doesn't repeat every day.
- **Unsaved work.** Apps with unsaved changes may show a "Save changes?" dialog and stay open. If a system action is set, it still runs after 6 seconds, so save your work first.
- **Running apps only.** The list shows apps that are open right now. If you close a ticked app, it disappears from the list and from your choices.
- **Windowless apps.** Apps that live only in the system tray, with no open window, may not appear in the list.
- **Timer is not saved.** A running timer is forgotten if you log out, reboot, restart the shell or disable the extension. Your settings are kept, but the timer must be started again.
- **Sleep.** The countdown follows the real clock. If the computer sleeps during a countdown and wakes after the time has passed, the action runs right after waking.
- **Minutes in steps of 5.** The *Set clock* minute button moves in 5-minute steps.

## What it runs, and what it stores

Auto Timer only runs these commands, and only when the timer ends:

| Action   | Command                                                         | Fallback if it fails                       |
|----------|-----------------------------------------------------------------|--------------------------------------------|
| Shut down | `systemctl poweroff`                                           | `gnome-session-quit --power-off --no-prompt` |
| Restart   | `systemctl reboot`                                             | `gnome-session-quit --reboot --no-prompt`    |
| Suspend   | `systemctl suspend`                                            | `loginctl suspend`                           |

Apps are closed through GNOME Shell's own API (`Shell.App.request_quit()`), not by killing processes.

Settings are stored in `~/.config/auto-timer-extension.json`. The extension makes no network connections.

## Troubleshooting

**The tile doesn't appear.** Log out and back in, then run `gnome-extensions enable auto-timer@local`. Check that it is listed with `gnome-extensions list`.

**It doesn't do anything when the timer ends.** Watch the shell log while it runs:

```bash
journalctl -f -o cat /usr/bin/gnome-shell
```

**"Tick at least one app to close, or choose an action under Then."** You started the timer with nothing to do. Tick an app or choose Shut down / Restart / Suspend.

## Development

The extension is two files:

- `metadata.json`: name, supported GNOME versions, session modes.
- `extension.js`: the whole extension.

Build an installable zip:

```bash
gnome-extensions pack --force .
```

On Wayland, log out and back in after changing the code. On X11 you can press <kbd>Alt</kbd>+<kbd>F2</kbd>, type `r` and press <kbd>Enter</kbd>.

The extension declares `"session-modes": ["user", "unlock-dialog"]` so that a running timer isn't cancelled when the screen locks.

Bug reports and pull requests are welcome. Please include your GNOME Shell version (`gnome-shell --version`) and the relevant lines from the shell log.

## License

GPL-2.0-or-later, the same license as GNOME Shell. See the `LICENSE` file.
