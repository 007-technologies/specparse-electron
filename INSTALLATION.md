# SpecParse — Installation Guide

**For end users — 2026-04-22**

Install SpecParse on macOS or Windows in about 5 minutes.

---

## System requirements

- **macOS:** 13.0 (Ventura) or later. Both Intel and Apple Silicon
  Macs are supported.
- **Windows:** Windows 10 (64-bit) or later.
- **Internet connection** required (for the AI-powered extraction
  steps; doesn't need to be fast).
- **Disk space:** ~500 MB available.

---

## macOS install

### 1. Download

You'll receive a `.dmg` file named `SpecParse-1.x.x.dmg` from Reed,
or you can download the latest from
[https://github.com/007-technologies/specparse-electron/releases](https://github.com/007-technologies/specparse-electron/releases).

### 2. Open the .dmg

Double-click the downloaded `.dmg` file. A window opens showing the
SpecParse icon and an Applications folder shortcut.

### 3. Drag to Applications

Drag the SpecParse icon onto the Applications folder shortcut.

### 4. First launch

Open the Applications folder. Find SpecParse. **Right-click** (or
Control-click) the app and choose **Open**.

macOS will show a warning:

> *"SpecParse" cannot be opened because the developer cannot be
> verified.*

This is expected. SpecParse isn't signed with an Apple Developer ID
yet (that's a ~$99/year Apple program; we'll add it when we ship
publicly).

Click **Open** in the dialog to bypass the warning. macOS remembers
this choice; subsequent launches won't show it.

### 5. Grant permissions (if prompted)

macOS may ask for permission to access the folder you drop spec
PDFs into. Click **Allow**.

### 6. Done

SpecParse is ready. See `USER-GUIDE.md` for the workflow.

---

## Windows install

### 1. Download

You'll receive a `SpecParse-Setup-1.x.x.exe` file from Reed, or
download from the releases page.

### 2. Run the installer

Double-click the downloaded `.exe`.

### 3. Windows SmartScreen warning

Windows will show a warning:

> *Windows protected your PC — Microsoft Defender SmartScreen
> prevented an unrecognized app from starting.*

This is expected. Like macOS, Windows trusts apps less when they
aren't signed with a paid code-signing certificate.

Click **More info** (the grey text under the warning), then click
**Run anyway**.

### 4. Installer wizard

The installer walks through:
- License agreement — click Agree
- Install location — default is fine (`C:\Program Files\SpecParse`)
- Start menu folder — default is fine
- Install progress bar

### 5. Finish

Click **Finish**. SpecParse launches automatically from the final
screen, or you can launch it later from the Start menu / desktop
shortcut.

---

## Updates

SpecParse checks for updates automatically when you launch it. When
a new version is available, you'll see a banner at the top of the
app.

- Click **Update now** to download and install the update. The app
  restarts automatically.
- Click **Remind me later** to defer until the next launch.

Updates are small (typically 10–50 MB delta) and install in under
a minute.

---

## Uninstall

### macOS

Drag SpecParse from your Applications folder to the Trash. Empty
the Trash.

Optionally, remove local config / project data:

```
~/Library/Application Support/SpecParse/
```

### Windows

Control Panel → Programs → Uninstall a Program → select SpecParse
→ Uninstall. Follow the uninstaller prompts.

Optionally, remove local config / project data:

```
C:\Users\[YourUsername]\AppData\Roaming\SpecParse\
```

---

## Troubleshooting

**"The app can't be opened because it's from an unidentified developer"
(macOS)** — use the right-click → Open method from the install
steps. Double-click alone doesn't work for unsigned apps on macOS.

**"This app can't run on your PC" (Windows)** — you're trying to
run the 64-bit installer on a 32-bit Windows. Check your Windows
version (Settings → System → About → System type). 32-bit Windows
isn't supported.

**"Internet connection required"** — SpecParse needs internet for
the AI-powered extraction steps. Check your network. If on a
corporate network, some firewalls block Anthropic's API
(`api.anthropic.com`) — ask IT to allow-list.

**"Invalid API key"** — the build you have may be missing the baked-in
API key. Email Reed for a fresh installer.

---

## Support

For install problems, bugs, or questions:
`support@007technologies.com`

Include:
- Your operating system and version
- A screenshot of any error messages
- What step you're stuck on
