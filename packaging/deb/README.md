# OLA Plus Debian package

`ola-plus` installs OLA with the new web UI as a systemd service, **replacing** the Debian `ola` and
`libola1t64` packages. It is built for Debian trixie / Raspberry Pi OS by the `deb` CI jobs, one per architecture:

| Package | For | Built |
| --- | --- | --- |
| `ola-plus_<version>_amd64.deb` | PCs and servers (Debian, Ubuntu-like systems on trixie libraries) | natively |
| `ola-plus_<version>_arm64.deb` | Raspberry Pi 3/4/5 with the 64-bit OS (the default for Pi 4 and 5) | natively on an ARM runner |
| `ola-plus_<version>_armhf.deb` | Raspberry Pi with the 32-bit OS | cross-compiled |

and the `deb-test` jobs prove, in a container of the same architecture, that each installs over `ola`,
runs, serves the UI and rolls back. The version comes from the commit (`0.10.9+plus<commit time>+g<hash>`),
so all three packages from one commit share it and later commits sort higher.

## Install (replacing the Debian ola)

Download the `.deb` for your architecture (`ola-plus-deb-amd64`, `-arm64` or `-armhf` artifact) of a green
[Actions](../../../../actions) run, copy it to the Pi and look at what apt would do first:

```bash
apt-get -s install ./ola-plus_*.deb        # simulation, changes nothing
```

It should list `ola` and `libola1t64` as **REMOVED** and `ola-plus` as installed. Then:

```bash
sudo apt install ./ola-plus_*.deb
```

What happens:

- the Debian `ola` and `libola1t64` packages are removed and `olad` is restarted from `ola-plus`;
  on an upgrade `olad` is restarted once the new files are in place, so DMX output pauses for the restart only (a few seconds);
- `/etc/ola` (plugin settings, universes, patch) is **kept as it is**, and so is the `olad` user;
- `olad.service` is a systemd unit (the old SysV script goes away with the old package) and starts at boot;
- the UI is installed next to the classic one. Open `http://<pi>:9090/` and you land on `/ui/`; the classic UI
  stays at `/classic`;
- fixtures, scenes and groups are stored as `/etc/ola/ola-ui-*.json`.

Check it:

```bash
systemctl status olad
journalctl -u olad -n 50
olad --version
```

Settings go in a drop-in, not in the package files:

```bash
sudo systemctl edit olad      # e.g. [Service] / Environment=OLAD_OPTS=--http-port 8080
```

## Go back to the Debian package

```bash
sudo apt install ola libola1t64      # removes ola-plus, keeps /etc/ola
```

## What is not done

- Only for Debian 13 "trixie" and systems with the same library versions; other releases need their own build.
- No Python bindings, RDM test server or development headers; this is the daemon and its tools.
- olad has no authentication: anyone on the network can use the UI and change documents. Only run it on a
  network you trust.

## Building it yourself

CI does this in `.github/workflows/ola-plus.yml` (job `deb`), and you can reproduce any package locally with
Docker (the UI must be built first, `npm run build` in `ui/`):

```bash
docker run --rm -v "$PWD:/work" -w /work debian:trixie   bash packaging/deb/build-arch.sh arm64 ui/dist out     # or amd64 / armhf
```

`build-arch.sh` builds natively when the target is the machine's own architecture and cross-compiles
otherwise, then `build-deb.sh` assembles the package from a `make install` tree configured with
`--prefix=/usr --sysconfdir=/etc --localstatedir=/var --libdir=/usr/lib/<multiarch>`.

## Making a release

`packaging/VERSION` holds the number of the **next** release (now above 0.10.9, so a Plus package always upgrades
the old Debian-based ones). Between releases CI builds snapshots versioned `0.11.0~git<time>+g<hash>`, which sort
before the release itself.

1. Make sure `packaging/VERSION` is the number you want, and `master` is green.
2. Tag it and push the tag: `git tag v0.11.0 && git push origin v0.11.0` (a release candidate is `v0.11.0-rc1`).
3. CI builds the three packages, installs each over the Debian `ola` in a container of its architecture, and only
   then opens a **draft** release with `OlaPlus-v0.11.0-amd64.deb`, `-arm64.deb`, `-armhf.deb` and `SHA256SUMS`.
   It refuses a tag that doesn't match `packaging/VERSION`.
4. Read the draft, then press **Publish** (nothing is public until you do).
5. Bump `packaging/VERSION` for the next release.
