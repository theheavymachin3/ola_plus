**OLA Plus** is an unofficial fork of the [Open Lighting Architecture](https://github.com/OpenLightingProject/ola) (OLA) with a touch-first web UI and the `olad` endpoints it needs, packaged for Debian 13 "trixie" and Raspberry Pi OS. Not affiliated with the Open Lighting Project.

## Download

Pick the file for your system. `armhf` is the 32-bit Raspberry Pi OS; `arm64` is the 64-bit one (Pi 3/4/5); `amd64` is a PC or server.

| File | For |
| --- | --- |
| `@NAME@-amd64.deb` | PCs and servers |
| `@NAME@-arm64.deb` | Raspberry Pi with the 64-bit OS |
| `@NAME@-armhf.deb` | Raspberry Pi with the 32-bit OS |

`SHA256SUMS` has the checksums (`sha256sum -c SHA256SUMS`).

## Install

```bash
apt-get -s install ./@NAME@-<arch>.deb     # simulation: shows what would be removed (ola, libola1t64)
sudo apt install ./@NAME@-<arch>.deb
```

The package replaces the Debian `ola` and `libola1t64` packages and keeps `/etc/ola` (plugin settings, universes, patch). `olad` is restarted, so DMX output pauses for a few seconds. Then open `http://<host>:9090/`.

To go back to the Debian package: `sudo apt install ola libola1t64` (your `/etc/ola` is kept). Details: [`packaging/deb/README.md`](https://github.com/theheavymachin3/ola_plus/blob/@TAG@/packaging/deb/README.md).

## What it includes
- **Web UI** at `/ui/` (the classic UI stays at `/classic`): Overview, Mixer with groups, Monitor (live grid of the 512 channels), Scenes (fade, tap again to switch off, Bump), Routing, Patch (fixtures and DMX addresses), Plugins.
- **olad**: `--ui-dir` and automatic discovery of an installed UI; `/json/patch_overview` (every device and port in one request); `/json/ui_store` and `/ui_store` (fixtures, scenes and groups stored on olad and shared by every device).
- A systemd service enabled at boot.

Every package in this release was installed over the Debian `ola` in a container of its own architecture, run, checked (UI, API, shared storage) and rolled back by CI before this release was opened.

## Known limitations
- Debian 13 "trixie" libraries only.
- **No authentication**: anyone on the network can use the UI and change its stored data. Use a network you trust.
- The offline app shell needs HTTPS or localhost.
- Scenes belong to one universe, and fades run in the browser.
- No Python bindings, RDM test server or development headers in the package.

Same licences as OLA: libraries LGPL-2.1+, programs GPL-2+.

