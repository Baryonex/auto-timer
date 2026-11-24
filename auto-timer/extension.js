// Auto Timer v2 - GNOME Shell Quick Settings extension (GNOME 45+)
// After a countdown, or at a set clock time: close chosen apps and/or
// shut down, restart or suspend the system.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {QuickMenuToggle, SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';

const CONFIG_PATH = GLib.build_filenamev([GLib.get_user_config_dir(), 'auto-timer-extension.json']);

// <pure>
const DEFAULTS = {
    mode: 'delay',          // 'delay' = countdown, 'clock' = at a time of day
    minutes: 30,
    clockH: 23,
    clockM: 0,
    action: 'shutdown',     // 'none' | 'shutdown' | 'reboot' | 'suspend'
    apps: [],               // apps ticked here are closed when the timer ends
};
const PRESETS = [5, 10, 15, 30, 45, 60, 90, 120, 180];
const ACTIONS = [
    {id: 'none', label: 'Do nothing', short: ''},
    {id: 'shutdown', label: 'Shut down', short: 'shut down'},
    {id: 'reboot', label: 'Restart', short: 'restart'},
    {id: 'suspend', label: 'Suspend', short: 'suspend'},
];

function pad(n) {
    return String(n).padStart(2, '0');
}

function clampInt(v, lo, hi, fallback) {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

function formatMinutes(m) {
    if (m < 60)
        return `${m} min`;
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? `${h} h ${r} min` : `${h} h`;
}

// compact label for the preset buttons
function presetLabel(m) {
    if (m < 60)
        return `${m} min`;
    return m % 60 === 0 ? `${m / 60} h` : `${(m / 60).toFixed(1)} h`;
}

function formatCountdown(totalSec) {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function formatTimeOfDay(h, m) {
    return `${pad(h)}:${pad(m)}`;
}

// Next moment the wall clock shows h:m (today, or tomorrow if already past).
function nextOccurrence(h, m, now = new Date()) {
    const t = new Date(now.getTime());
    t.setHours(h, m, 0, 0);
    if (t.getTime() <= now.getTime())
        t.setDate(t.getDate() + 1);
    return t;
}

// "Close apps & restart", or the compact "Apps + restart" for the small tile.
function describeAction(cfg, compact = false) {
    const act = ACTIONS.find(a => a.id === cfg.action) ?? ACTIONS[0];
    const sys = act.id !== 'none';
    const closing = cfg.apps.length > 0;
    if (closing && sys)
        return compact ? `Apps + ${act.short}` : `Close apps & ${act.short}`;
    if (closing)
        return 'Close apps';
    if (sys)
        return act.short.charAt(0).toUpperCase() + act.short.slice(1);
    return 'No action';
}

// Accepts anything (including the v1 file format) and returns a valid config.
function normalizeConfig(saved) {
    const cfg = {...DEFAULTS, ...(saved ?? {})};
    cfg.apps = Array.isArray(saved?.apps) ? [...saved.apps] : [];
    if (saved && saved.action === undefined && saved.shutdown !== undefined)
        cfg.action = saved.shutdown ? 'shutdown' : 'none';      // v1 -> v2
    delete cfg.shutdown;
    // v2 had a separate on/off switch for closing apps. Without it, ticked apps
    // are always closed, so drop the list if the switch used to be off.
    if (saved && saved.closeApps === false)
        cfg.apps = [];
    delete cfg.closeApps;
    if (!ACTIONS.some(a => a.id === cfg.action))
        cfg.action = DEFAULTS.action;
    if (cfg.mode !== 'delay' && cfg.mode !== 'clock')
        cfg.mode = 'delay';
    cfg.minutes = clampInt(cfg.minutes, 1, 1440, DEFAULTS.minutes);
    cfg.clockH = clampInt(cfg.clockH, 0, 23, DEFAULTS.clockH);
    cfg.clockM = clampInt(cfg.clockM, 0, 59, DEFAULTS.clockM);
    return cfg;
}
// </pure>

const WARN_SECONDS = 60;   // notify this long before the action
const GRACE_SECONDS = 6;   // wait after closing apps before the system action

const COMMANDS = {
    shutdown: [['systemctl', 'poweroff'], ['gnome-session-quit', '--power-off', '--no-prompt']],
    reboot: [['systemctl', 'reboot'], ['gnome-session-quit', '--reboot', '--no-prompt']],
    suspend: [['systemctl', 'suspend'], ['loginctl', 'suspend']],
};

function loadConfig() {
    try {
        const [ok, bytes] = Gio.File.new_for_path(CONFIG_PATH).load_contents(null);
        if (ok)
            return normalizeConfig(JSON.parse(new TextDecoder().decode(bytes)));
    } catch (e) {
        // first run or unreadable file: use defaults
    }
    return normalizeConfig(null);
}

function saveConfig(cfg) {
    try {
        const bytes = new TextEncoder().encode(JSON.stringify(cfg, null, 2));
        Gio.File.new_for_path(CONFIG_PATH).replace_contents(
            bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    } catch (e) {
        logError(e, 'Auto Timer: could not save settings');
    }
}

// ---------- menu items that do NOT close the panel when clicked ----------

// Stock switch items close the whole panel on click; this one only toggles.
const StayOpenSwitch = GObject.registerClass(
class StayOpenSwitch extends PopupMenu.PopupSwitchMenuItem {
    activate(_event) {
        if (this._switch.mapped)
            this.toggle();
    }
});

// A list entry that reports a pick but leaves the panel open.
const PickItem = GObject.registerClass({
    Signals: {'picked': {}},
}, class PickItem extends PopupMenu.PopupMenuItem {
    activate(_event) {
        this.emit('picked');
    }
});

// ---------- the Quick Settings tile ----------

const TimerToggle = GObject.registerClass(
class TimerToggle extends QuickMenuToggle {
    constructor(cfg, onDisplay) {
        super({
            title: 'Auto Timer',
            iconName: 'alarm-symbolic',
            toggleMode: true,
        });

        this._cfg = cfg;
        this._onDisplay = onDisplay;   // called with "MM:SS" while running, null when idle
        this._tickId = 0;
        this._powerOffId = 0;
        this._deadline = 0;            // ms since epoch
        this._totalSec = 0;
        this._warned = false;
        this._syncing = false;

        this.menu.setHeader('alarm-symbolic', 'Auto Timer', 'Shut down, restart, suspend or close apps');
        this._buildMenu();
        this._refreshLabels();

        this.connect('notify::checked', () => {
            if (this._syncing)
                return;
            if (this.checked)
                this._start();
            else
                this._stop();
        });
        this.connect('destroy', () => this._cleanup());
    }

    // ----- menu -----

    _buildMenu() {
        const cfg = this._cfg;

        this.menu.connect('open-state-changed', (_menu, open) => {
            if (open) {
                this._rebuildApps();        // drop apps that were closed meanwhile
                this._refreshLabels();      // e.g. "today" may have become "tomorrow"
            }
        });

        // --- what should happen
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('When the timer ends'));

        this._appsItem = new PopupMenu.PopupSubMenuMenuItem('');
        this._appsItem.menu.connect('open-state-changed', (_menu, open) => {
            if (open)
                this._rebuildApps();
        });
        this.menu.addMenuItem(this._appsItem);
        this._rebuildApps();

        this._actionItem = new PopupMenu.PopupSubMenuMenuItem('');
        this._actionRadios = ACTIONS.map(act => {
            const item = new PickItem(act.label);
            item.connect('picked', () => {
                cfg.action = act.id;
                this._actionItem.menu.close(true);
                this._changed();
            });
            this._actionItem.menu.addMenuItem(item);
            return [act.id, item];
        });
        this.menu.addMenuItem(this._actionItem);

        // --- when
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('When'));

        // countdown: custom entry first (always visible), then a compact preset grid
        this._delayItem = new PopupMenu.PopupSubMenuMenuItem('');

        const entryItem = new PopupMenu.PopupBaseMenuItem({activate: false});
        this._entry = new St.Entry({
            hint_text: 'Custom minutes… (Enter)',
            can_focus: true,
            x_expand: true,
        });
        this._entry.clutter_text.connect('activate', () => {
            const v = parseInt(this._entry.get_text(), 10);
            if (Number.isFinite(v) && v >= 1) {
                this._setDelay(Math.min(v, 1440));
                this._entry.set_text('');
            }
        });
        entryItem.add_child(this._entry);
        this._delayItem.menu.addMenuItem(entryItem);

        const gridItem = new PopupMenu.PopupBaseMenuItem({activate: false, can_focus: false});
        const grid = new St.BoxLayout({vertical: true, x_expand: true, style: 'spacing: 6px;'});
        this._presetButtons = [];
        for (let i = 0; i < PRESETS.length; i += 3) {
            const row = new St.BoxLayout({x_expand: true, style: 'spacing: 6px;'});
            for (const m of PRESETS.slice(i, i + 3)) {
                const button = new St.Button({
                    label: presetLabel(m),
                    style_class: 'button',
                    x_expand: true,
                    can_focus: true,
                    reactive: true,
                });
                button.connect('clicked', () => this._setDelay(m));
                row.add_child(button);
                this._presetButtons.push([m, button]);
            }
            grid.add_child(row);
        }
        gridItem.add_child(grid);
        this._delayItem.menu.addMenuItem(gridItem);
        this.menu.addMenuItem(this._delayItem);

        // set clock: hour and minute steppers
        this._clockItem = new PopupMenu.PopupSubMenuMenuItem('');
        const clockRow = new PopupMenu.PopupBaseMenuItem({activate: false, can_focus: false});
        const box = new St.BoxLayout({
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            style: 'spacing: 10px;',
        });
        this._hourStepper = this._makeStepper(d => this._stepClock('h', d));
        const colon = new St.Label({
            text: ':',
            y_align: Clutter.ActorAlign.CENTER,
            style: 'font-weight: bold; font-size: 1.3em;',
        });
        this._minStepper = this._makeStepper(d => this._stepClock('m', d));
        box.add_child(this._hourStepper.box);
        box.add_child(colon);
        box.add_child(this._minStepper.box);
        clockRow.add_child(box);
        this._clockItem.menu.addMenuItem(clockRow);
        this.menu.addMenuItem(this._clockItem);

        const submenus = [this._appsItem, this._actionItem, this._delayItem, this._clockItem];
        for (const item of submenus) {
            item.menu.connect('open-state-changed', (_menu, open) => {
                if (!open)
                    return;
                for (const other of submenus) {
                    if (other !== item)
                        other.menu.close(false);
                }
            });
        }
    }

    _makeStepper(onStep) {
        const box = new St.BoxLayout({style: 'spacing: 6px;', y_align: Clutter.ActorAlign.CENTER});
        const button = (iconName, delta) => {
            const b = new St.Button({
                style_class: 'icon-button',
                can_focus: true,
                reactive: true,
                child: new St.Icon({icon_name: iconName, icon_size: 16}),
            });
            b.connect('clicked', () => onStep(delta));
            return b;
        };
        const label = new St.Label({
            text: '00',
            y_align: Clutter.ActorAlign.CENTER,
            style: 'min-width: 2em; text-align: center; font-weight: bold; font-size: 1.3em;',
        });
        box.add_child(button('list-remove-symbolic', -1));
        box.add_child(label);
        box.add_child(button('list-add-symbolic', 1));
        return {box, label};
    }

    _rebuildApps() {
        const cfg = this._cfg;
        const appSystem = Shell.AppSystem.get_default();
        const running = new Map();

        for (const app of appSystem.get_running()) {
            const id = app.get_id();
            if (!id)
                continue;
            const info = app.get_app_info();
            if (info && info.get_nodisplay())
                continue;                       // hide background helpers
            running.set(id, {name: app.get_name(), icon: app.get_icon()});
        }

        // an app that has been closed disappears from the list and from the ticked set
        const stillOpen = cfg.apps.filter(id => running.has(id));
        if (stillOpen.length !== cfg.apps.length) {
            cfg.apps = stillOpen;
            saveConfig(cfg);
        }

        this._appsItem.menu.removeAll();

        if (running.size === 0) {
            const empty = new PopupMenu.PopupMenuItem('No running apps', {reactive: false});
            empty.setSensitive(false);
            this._appsItem.menu.addMenuItem(empty);
        }

        const sorted = [...running.entries()].sort((x, y) => x[1].name.localeCompare(y[1].name));
        for (const [id, info] of sorted) {
            const item = new StayOpenSwitch(info.name, cfg.apps.includes(id));
            if (info.icon) {
                item.insert_child_at_index(
                    new St.Icon({gicon: info.icon, style_class: 'popup-menu-icon'}), 1);
            }
            item.connect('toggled', (_item, state) => {
                const set = new Set(cfg.apps);
                if (state)
                    set.add(id);
                else
                    set.delete(id);
                cfg.apps = [...set];
                this._changed();
            });
            this._appsItem.menu.addMenuItem(item);
        }

        this._appsItem.label.text = `Apps to close (${cfg.apps.length})`;
    }

    // ----- settings changes -----

    _setDelay(minutes) {
        this._cfg.minutes = minutes;
        this._cfg.mode = 'delay';
        this._delayItem.menu.close(true);
        this._changed(true);
    }

    _stepClock(which, delta) {
        const cfg = this._cfg;
        if (which === 'h')
            cfg.clockH = (cfg.clockH + delta + 24) % 24;
        else
            cfg.clockM = (cfg.clockM + delta * 5 + 60) % 60;
        cfg.mode = 'clock';
        this._changed(true);
    }

    // restart = the schedule itself changed, so a running timer starts over
    _changed(restart = false) {
        saveConfig(this._cfg);
        this._refreshLabels();
        if (restart && this._tickId)
            this._start();
    }

    // ----- text -----

    _whenText() {
        const cfg = this._cfg;
        return cfg.mode === 'clock'
            ? formatTimeOfDay(cfg.clockH, cfg.clockM)
            : formatMinutes(cfg.minutes);
    }

    _refreshLabels() {
        const cfg = this._cfg;
        const delayMode = cfg.mode === 'delay';

        this._appsItem.label.text = `Apps to close (${cfg.apps.length})`;

        const act = ACTIONS.find(a => a.id === cfg.action) ?? ACTIONS[0];
        this._actionItem.label.text = `Then: ${act.label}`;
        for (const [id, item] of this._actionRadios) {
            item.setOrnament(id === cfg.action
                ? PopupMenu.Ornament.CHECK
                : PopupMenu.Ornament.NONE);
        }

        this._delayItem.label.text = `${delayMode ? '● ' : ''}Countdown: ${formatMinutes(cfg.minutes)}`;
        for (const [m, button] of this._presetButtons) {
            const on = delayMode && m === cfg.minutes;
            button.checked = on;
            button.label = (on ? '✓ ' : '') + presetLabel(m);
            button.style = on ? 'font-weight: bold;' : '';
        }

        const target = nextOccurrence(cfg.clockH, cfg.clockM);
        const day = target.getDate() === new Date().getDate() ? 'today' : 'tomorrow';
        this._clockItem.label.text =
            `${delayMode ? '' : '● '}Set clock: ${formatTimeOfDay(cfg.clockH, cfg.clockM)} · ${day}`;
        this._hourStepper.label.text = pad(cfg.clockH);
        this._minStepper.label.text = pad(cfg.clockM);

        if (!this._tickId)
            this.subtitle = `${this._whenText()} · ${describeAction(cfg, true)}`;
    }

    // ----- timer -----

    _setChecked(value) {
        this._syncing = true;
        this.checked = value;
        this._syncing = false;
    }

    _clearTick() {
        if (this._tickId) {
            GLib.source_remove(this._tickId);
            this._tickId = 0;
        }
    }

    _start() {
        const cfg = this._cfg;

        if (cfg.action === 'none' && cfg.apps.length === 0) {
            Main.notify('Auto Timer', 'Tick at least one app to close, or choose an action under "Then".');
            this._setChecked(false);
            return;
        }

        this._clearTick();
        const now = Date.now();
        this._deadline = cfg.mode === 'clock'
            ? nextOccurrence(cfg.clockH, cfg.clockM).getTime()
            : now + cfg.minutes * 60000;
        this._totalSec = Math.ceil((this._deadline - now) / 1000);
        this._warned = false;
        this._setChecked(true);
        this._updateDisplay(this._totalSec);
        this._tickId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => this._tick());
    }

    _stop() {
        this._clearTick();
        this._setChecked(false);
        this._onDisplay(null);
        this._refreshLabels();
    }

    _updateDisplay(remaining) {
        const clock = formatCountdown(remaining);
        this.subtitle = `${clock} · ${describeAction(this._cfg, true)}`;
        this._onDisplay(clock);
    }

    _tick() {
        const remaining = Math.ceil((this._deadline - Date.now()) / 1000);

        if (remaining <= 0) {
            this._tickId = 0;          // the source is removed by returning SOURCE_REMOVE
            this._fire();
            return GLib.SOURCE_REMOVE;
        }

        if (!this._warned && remaining <= WARN_SECONDS && this._totalSec > WARN_SECONDS) {
            this._warned = true;
            Main.notify('Auto Timer',
                `${describeAction(this._cfg)} in 1 minute. Open Quick Settings and switch the timer off to cancel.`);
        }

        this._updateDisplay(remaining);
        return GLib.SOURCE_CONTINUE;
    }

    // ----- actions -----

    _fire() {
        const cfg = this._cfg;
        const closing = cfg.apps.length > 0;
        this._stop();

        if (closing)
            this._closeApps();

        if (cfg.action === 'none')
            return;

        if (closing) {
            // give the apps a moment to quit cleanly
            this._powerOffId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, GRACE_SECONDS, () => {
                this._powerOffId = 0;
                this._runSystemAction(cfg.action);
                return GLib.SOURCE_REMOVE;
            });
        } else {
            this._runSystemAction(cfg.action);
        }
    }

    _closeApps() {
        const appSystem = Shell.AppSystem.get_default();
        for (const id of this._cfg.apps) {
            const app = appSystem.lookup_app(id);
            if (app && app.state === Shell.AppState.RUNNING)
                app.request_quit();     // graceful: same as clicking the window close buttons
        }
    }

    _runSystemAction(action) {
        const chain = COMMANDS[action];
        if (chain)
            this._runChain(action, chain);
    }

    // try each command in turn until one succeeds
    _runChain(action, commands) {
        const [argv, ...rest] = commands;
        const next = e => {
            if (rest.length)
                this._runChain(action, rest);
            else
                logError(e, `Auto Timer: could not ${action}`);
        };
        try {
            const proc = Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
            proc.wait_check_async(null, (p, res) => {
                try {
                    p.wait_check_finish(res);
                } catch (e) {
                    next(e);
                }
            });
        } catch (e) {
            next(e);
        }
    }

    _cleanup() {
        this._clearTick();
        if (this._powerOffId) {
            GLib.source_remove(this._powerOffId);
            this._powerOffId = 0;
        }
    }
});

// ---------- panel indicator (icon + countdown, only while running) ----------

const TimerIndicator = GObject.registerClass(
class TimerIndicator extends SystemIndicator {
    constructor(cfg) {
        super();

        this._icon = this._addIndicator();
        this._icon.iconName = 'alarm-symbolic';
        this._icon.visible = false;

        this._label = new St.Label({
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        this.add_child(this._label);

        this.toggle = new TimerToggle(cfg, text => {
            const running = text !== null;
            this._icon.visible = running;
            this._label.visible = running;
            if (running)
                this._label.text = text;
        });
        this.quickSettingsItems.push(this.toggle);
    }
});

// ---------- extension entry point ----------

export default class AutoTimerExtension extends Extension {
    enable() {
        this._indicator = new TimerIndicator(loadConfig());
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
    }

    disable() {
        this._indicator.quickSettingsItems.forEach(item => item.destroy());
        this._indicator.destroy();
        this._indicator = null;
    }
}
