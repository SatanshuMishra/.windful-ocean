---
name: vm-lab
description: Use when an app must be run, installed, clicked through, or tested end to end on macOS, Windows 11, Android (phone or tablet), or iPad without touching this Mac. Drives the `lab` command in ~/VMLab, which starts a disposable instance from a clean golden image, operates it (commands, installs, screenshots, clicks, typing, UI trees), resets it to clean, and deletes it.
---

# VM Lab

`lab` (source: `~/VMLab/bin/lab`, on PATH) is the one interface to the sandboxes. Every instance is a throwaway copy of a golden image; nothing done inside it reaches this Mac or the golden.

## Platforms

| Platform arg | Engine | Instance names | Screenshot size (click coordinates) |
|---|---|---|---|
| `macos` | Tart VM, macOS 26 | `macos-1`, `macos-2` | 1440x900 |
| `windows` | VMware Fusion VM, Windows 11 Arm64 | `windows-1`, ... | 1024x768 until VMware Tools resizes it |
| `android-phone` | Android Emulator, Pixel 9, Android 17 + Play | fixed: `android-phone` | 1080x2424 |
| `android-tablet` | Android Emulator, Pixel Tablet | fixed: `android-tablet` | 2560x1600 |
| `ipad` | Xcode Simulator, iPad Pro 13-inch (M5), iPadOS 26.3 | `ipad-1`, ... (`--model "iPad mini (A17 Pro)"` for others) | 1032x1376 points |

Coordinates are pixels of the PNG that `lab screenshot` saved. When the Read tool displays a downscaled image it states the multiplier; apply it before clicking.

## The loop

```
lab status                          # goldens and running instances
lab up <platform> [--gui]           # prints the instance name; --gui shows a window to the user
lab up android-phone --camera <file>  # Android cameras show this .png/.jpg/.mp4/.mov (see Cameras)
lab exec <name> -- <command>        # macOS: zsh via SSH; Windows: PowerShell; Android: adb shell; iPad: simctl spawn
lab install <name> <build>          # .app/.pkg/.dmg, .msi/.exe/.msix/.zip, .apk, simulator .app
lab install <name> <app.apk> --grant-all  # Android only: pre-grant every permission, no prompts
lab open <name> <app|bundle-id|package|url>
lab open <name> <url> --camera <file>  # macOS/Windows: Chrome or Edge with the file as its camera
lab screenshot <name>               # prints the PNG path; Read it
lab click <name> <x> <y> [--double|--right]
lab ui <name>                       # android/ipad: element tree with @refs
lab click <name> @e12               # android/ipad: tap an element from lab ui
lab type <name> "text"              # put -- before text that starts with a dash
lab key <name> enter | esc | tab | ctrl-a | super-space | home | back
lab drag <name> x1 y1 x2 y2
lab push <name> <local> [remote]    lab pull <name> <remote> [local]
lab wait <name> [--settle N]        # after reboots or installs; never write sleep loops
lab reset <name>                    # back to clean golden state, same name
lab down <name>                     # stop and delete
```

Key combos use one syntax everywhere (`ctrl-a`, `super-space`, `cmd+shift+z`); `lab` translates them per platform, with `super` meaning Command on macOS and iPad and the Windows key on Windows. `lab exec` on Windows quotes each argument when given several; pass one quoted string for a full PowerShell pipeline.

Typical durations: macOS up ~20 s, reset ~20 s; Android up ~10-15 s, reset ~6 s; iPad up/reset ~30-40 s; Windows up 1-3 min. Give Bash a 600000 ms timeout for `up` and `reset`.

## Cameras

No lab instance has a real camera. When a test reaches anything camera-based (a camera screen, QR or barcode scanning, photo or video capture, video calls, document or face capture), tell the user at the start that the sandbox has no real camera, use the substitute below, and list what still needs a real device: the camera hardware itself (focus, exposure, low light, lens), and the platform's real camera permission flow on hardware.

| Where | Substitute |
|---|---|
| Android phone and tablet, any app | `lab up android-phone --camera photo.png` (or `.jpg`, `.mp4`, `.mov`). Front and back cameras both show the file, fitted whole and centred. Without `--camera` they show a "LAB CAMERA" test card. `lab reset` keeps the file; to change it, `lab down` then `lab up --camera`. |
| Websites in Chrome or Edge, macOS or Windows | `lab open <name> <url> --camera <file>` restarts the browser at the URL with the file as its only camera. Windows has Edge. macOS instances have no Chrome or Edge: install one first, asking the user before accepting any browser terms, or download open-source Chromium (no terms) inside the instance. |
| Native macOS or Windows apps | No substitute. Real device. |
| iPad Simulator, native apps or Safari | No substitute; the Simulator has no camera. Photo-library flows can be tested with `xcrun simctl addmedia <udid> <file>`. Camera features need a real iPad. |

Pick test files that show what the feature expects: a QR code encoding a known value, a document photo, a face. Assert on what the app does with it (the decoded value, the saved photo), not only on the preview.

Permission prompts are part of the test. `lab install` on Android leaves runtime permissions ungranted, so camera, microphone, photo and notification prompts appear as they would for a user; answer them like a user would, and use `--grant-all` only when the prompts are not what is being tested. Browsers ask before sharing the camera; allowing it inside an instance is fine.

## Rules

- Inside a lab instance, act freely and without asking: install anything, change any setting, run destructive commands, and crash or break the system to find its limits. That is what the instances are for, and `lab reset` restores them. The rules below exist only to keep that freedom from reaching anything outside the lab.
- Operate only lab instances. A real Android phone may be plugged into this Mac and `mobile-mcp` lists it; never act on a real device, and never run `adb` without `-s`.
- Reset between test runs instead of cleaning up by hand. `lab down` everything when the task ends.
- Goldens change only when the user asks: `lab golden <platform> edit`, make the change, `lab golden <platform> seal`. Windows seal requires that no `windows-*` instances exist at all, running or stopped. Android seal only accepts devices started with `lab golden android edit`.
- `lab down` and `lab reset` only act on instances `lab` created; names are lowercase letters, digits and dashes.
- Never sign in to the user's personal accounts inside an instance, and never copy credentials in. Terms or consent screens (Chrome first run, app store terms) need the user's approval before accepting.
- The iPad Simulator runs apps as ordinary Mac processes, so it isolates nothing: install only the user's own builds there. The Android emulator can reach services on this Mac's localhost through 10.0.2.2.
- Known prompts: an iPad may ask to add a "French (Canada)" keyboard (this Mac uses the Canadian layout); answer Not Now. Chrome on Android and Edge on Windows show first-run screens that include terms; ask the user before accepting.
- Text typed into a macOS instance arrives exactly as typed: the golden turns off auto-capitalization, autocorrect and smart quotes and dashes. A test that needs those behaviours turns them on inside its instance.
- A rendering glitch seen only in the macOS VM (garbled or striped text, flicker, missing shapes) is not automatically a VM artifact. The VM's virtual GPU is slower than the real one, which exposes real timing bugs in rendering engines. Before dismissing it, reproduce it on a newer build of the framework or engine, and ask the user to check it on real hardware.
- Memory is 24 GB: run one macOS VM plus one of Windows or an Android emulator at a time. Apple allows at most two macOS VMs running at once.
- Parallels Desktop on this Mac is the user's personal tool, not part of the lab. Never start, stop, change or delete Parallels VMs or settings. A running Parallels macOS VM uses one of the two macOS slots; if `lab up macos` fails on that limit, tell the user instead of stopping their VM.
- Do not read `~/VMLab/config` or `~/VMLab/keys`; `lab` uses them itself.

## Other control surfaces

- iPad and Android UI can also be driven through the `mobile-mcp` MCP server (accessibility snapshots, taps) and, for iPad in the desktop app, the built-in iOS Simulator tool.
- `lab gui <name>` opens a window so the user can watch or take over.

## When something fails

- `lab doctor` checks every tool and golden image and prints the fix command.
- A macOS instance that resolves names but cannot load HTTPS: check `lab exec <name> -- ifconfig en0` shows `mtu 1280`. `lab` sets it in every instance it starts, and it survives reboots, because a VPN on this Mac drops the VM's full-size packets. If it reads 1500, `lab reset` restores it.
- Logs: `~/VMLab/logs/<name>.log` (macOS, Android), `~/VMLab/logs/<name>-vmrun.log` (Windows). Windows golden build progress: `~/VMLab/logs/windows-golden-progress.png`.
- Rebuild a golden from scratch: `lab golden macos prepare --rebuild`, `lab golden windows prepare --rebuild [--iso PATH]` (finish an interrupted build with `--resume`), `lab golden android prepare [--device android-phone]` (always re-creates the clean snapshot). `lab golden ipad prepare [--model NAME]` only creates a missing golden; to rebuild one, delete it with `xcrun simctl delete ipad-golden` first.
