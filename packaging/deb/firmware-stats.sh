#!/bin/sh
# Reads the Raspberry Pi firmware's voltages, throttling flags and ARM clock with vcgencmd and
# writes them to /run/ola-plus/firmware.txt, which olad serves to the web UI as /json/system_stats.
#
# It runs as its own unprivileged service (group "video" is what vcgencmd needs), so olad itself
# gets no extra rights. The file is replaced atomically and carries an "updated" timestamp:
# olad ignores readings older than 30 seconds, so a stopped reader never shows stale numbers.
set -u

OUT=${OLA_PLUS_FIRMWARE_FILE:-/run/ola-plus/firmware.txt}
INTERVAL=${OLA_PLUS_FIRMWARE_INTERVAL:-5}
VCGENCMD=${VCGENCMD:-vcgencmd}

umask 022
tmp="$OUT.$$"
trap 'rm -f "$tmp"' EXIT INT TERM

# "volt=1.2000V" -> 1.2000
volts() {
    "$VCGENCMD" measure_volts "$1" 2> /dev/null | sed -n 's/^volt=\([0-9.]*\)V.*/\1/p'
}

while :; do
    {
        for rail in core sdram_c sdram_i sdram_p; do
            v=$(volts "$rail")
            [ -n "$v" ] && echo "volts_$rail=$v"
        done
        # "throttled=0x50005"
        "$VCGENCMD" get_throttled 2> /dev/null | sed -n 's/^throttled=\(0x[0-9a-fA-F]*\).*/throttled=\1/p'
        # "frequency(48)=600062000"
        "$VCGENCMD" measure_clock arm 2> /dev/null | sed -n 's/^frequency([0-9]*)=\([0-9]*\).*/arm_clock_hz=\1/p'
        echo "updated=$(date +%s)"
    } > "$tmp" && mv -f "$tmp" "$OUT"
    sleep "$INTERVAL"
done
