# OLA Plus Debian package

`ola-plus` installs OLA with the new web UI as a systemd service, **replacing** the Debian `ola` and
`libola1t64` packages. It is built for 32-bit ARM (`armhf`: Raspberry Pi OS 32-bit, Debian trixie) by the
`deb-armhf` CI job, and `deb-test` proves in a 32-bit ARM container that it installs over `ola`, runs,
serves the UI and rolls back.

## Install (replacing the Debian ola)

Download `ola-plus_<version>_armhf.deb` from the `ola-plus-deb-armhf` artifact of a green
[Actions](../../../../actions) run, copy it to the Pi and look at what apt would do first:

```bash
apt-get -s install ./ola-plus_*_armhf.deb        # simulation, changes nothing
```

It should list `ola` and `libola1t64` as **REMOVED** and `ola-plus` as installed. Then:

```bash
sudo apt install ./ola-plus_*_armhf.deb
```

What happens:

- the Debian `ola` and `libola1t64` packages are removed and `olad` is restarted from `ola-plus`;
  expect a short interruption of DMX output while it restarts;
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

- Only `armhf`. An `arm64` or `amd64` package needs another CI job.
- No Python bindings, RDM test server or development headers; this is the daemon and its tools.
- olad has no authentication: anyone on the network can use the UI and change documents. Only run it on a
  network you trust.

## Building it yourself

CI does this in `.github/workflows/ola-plus.yml` (job `deb-armhf`). The package is assembled from a
`make install` tree configured with `--prefix=/usr --sysconfdir=/etc --localstatedir=/var
--libdir=/usr/lib/arm-linux-gnueabihf` by `packaging/deb/build-deb.sh`.
