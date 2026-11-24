GNOME Shell (45–50) Quick Settings extension to run a countdown or clock timer that gracefully closes chosen apps and/or shuts down, restarts, or suspends the system.

Topics

gnome-shell gnome-extension quick-settings timer shutdown suspend linux gjs
Clean README.md
Markdown

# Auto Timer

A GNOME Shell Quick Settings extension (**GNOME 45–50**) that lets you run a countdown or set a clock time to gracefully close selected applications and/or shut down, restart, or suspend your system.

## Features

- **Quick Settings Tile & Top-Bar Countdown:** Adds an **Auto Timer** toggle to Quick Settings and displays an alarm icon with a live countdown in the top panel while active.
- **Countdown & Clock Modes:**
  - **Countdown:** Choose presets (`5 min` to `3 h`) or enter a custom duration (`1`–`1440` minutes).
  - **Set clock:** Pick a target hour (`00`–`23`) and minute (`00`–`59` in 5-minute steps) for today or tomorrow.
- **Graceful App Closing:** Select running apps to quit cleanly (`app.request_quit()`) with a 6-second grace period before executing a system action.
- **Power Actions:** Shut down, restart, suspend, or close apps only.
- **1-Minute Warning:** Sends a desktop notification 60 seconds before completion so you can switch it off to cancel.
- **Lock Screen Support:** Works in both `"user"` and `"unlock-dialog"` session modes.
<img width="399" height="1003" alt="Screenshot From 2026-11-24 14-07-47" src="https://github.com/user-attachments/assets/7c8acdc6-dd66-4f2f-994b-1b4be38af482" />
<img width="402" height="827" alt="Screenshot From 2026-11-24 13-39-46" src="https://github.com/user-attachments/assets/e405a9bb-d2bf-489d-8c84-7b52cd82253d" />
<img width="406" height="929" alt="Screenshot From 2026-11-24 13-39-33" src="https://github.com/user-attachments/assets/cc664d9b-3f70-4e93-a130-9673e9fc1ee6" />
<img width="406" height="915" alt="Screenshot From 2026-11-24 13-39-22" src="https://github.com/user-attachments/assets/a56320ad-28f3-4df9-9579-3eb1dc8d1578" />
<img width="403" height="767" alt="Screenshot From 2026-11-24 13-38-28" src="https://github.com/user-attachments/assets/2d27d770-74f4-49d6-a2b5-1e2bd753a9e6" />

## Installation

```bash
git clone https://github.com/Baryonex/auto-timer.git
cd auto-timer/auto-timer
chmod +x install.sh
./install.sh

After running install.sh, log out and log back in (Wayland) or press Alt + F2, type r, and press Enter (X11) to reload GNOME Shell.
Usage

    Open Quick Settings in the top-right panel and expand Auto Timer.

    Select Apps to close and/or Then (Do nothing, Shut down, Restart, Suspend).

    Choose a Countdown duration or Set clock time.

    Toggle Auto Timer on to start (or off anytime to cancel).

Configuration

Settings are automatically saved to ~/.config/auto-timer-extension.json:
JSON

{
  "mode": "delay",
  "minutes": 30,
  "clockH": 23,
  "clockM": 0,
  "action": "shutdown",
  "apps": []
}
