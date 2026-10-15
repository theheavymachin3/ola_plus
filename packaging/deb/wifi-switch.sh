#!/bin/sh
# Wi-Fi control for the web UI: radio on/off, list of networks in range, join a network.
#
# olad runs as an unprivileged user and cannot touch rfkill or NetworkManager. It leaves small
# request files in $REQUEST_DIR (only olad and root can read them); this service runs as root,
# reads them as plain text (never evaluated) and acts:
#
#   wifi      one word, "on" or "off"           -> rfkill unblock/block wifi
#   scan      any content                       -> rescan, write $DIR/networks.txt
#   connect   line 1 SSID, line 2 password (empty for an open network), line 3 "hidden" or empty
#                                               -> nmcli device wifi connect; result in $DIR/connect.txt
#
# Request files are deleted as soon as they are read, so a password never stays on disk.
# olad reads the radio state itself from /sys/class/rfkill, and networks.txt / connect.txt from $DIR.
set -u

DIR=${OLA_PLUS_NET_DIR:-/run/ola-plus-net}
REQUEST_DIR=$DIR/request
RFKILL=${RFKILL:-rfkill}
NMCLI=${NMCLI:-nmcli}
GROUP=${OLA_PLUS_NET_GROUP:-olad}
INTERVAL=${OLA_PLUS_NET_INTERVAL:-1}
NETWORKS=$DIR/networks.txt
RESULT=$DIR/connect.txt

# Only olad (group) may leave a request.
install -d -m 0770 -o root -g "$GROUP" "$REQUEST_DIR" || exit 1
umask 022

# Takes a request file's lines into $1, $2, $3 ... via the global variables l1 l2 l3, then deletes it.
take() {
    l1= l2= l3=
    {
        IFS= read -r l1
        IFS= read -r l2
        IFS= read -r l3
    } < "$1" 2> /dev/null || true
    rm -f "$1"
}

# regular file, not a link someone planted
present() {
    [ -f "$1" ] && [ ! -L "$1" ]
}

# nmcli's terse output separates fields with ':' and escapes ':' and '\' in values with '\'.
# Writes "net<TAB>in_use<TAB>signal<TAB>security<TAB>ssid" per network; hidden networks (no SSID)
# and SSIDs holding a tab are left out.
parse_networks() {
    awk '{
        n = 0; f = ""; s = $0
        for (i = 1; i <= length(s); i++) {
            c = substr(s, i, 1)
            if (c == "\\") { i++; f = f substr(s, i, 1) }
            else if (c == ":" && n < 3) { fld[n++] = f; f = "" }
            else f = f c
        }
        if (n == 3 && f != "" && index(f, "\t") == 0)
            printf "net\t%d\t%d\t%s\t%s\n", (fld[0] == "*") ? 1 : 0, fld[1], fld[2], f
    }'
}

scan() {
    tmp=$NETWORKS.$$
    out=$("$NMCLI" -t -f IN-USE,SIGNAL,SECURITY,SSID device wifi list --rescan yes 2> /dev/null) ||
        out=$("$NMCLI" -t -f IN-USE,SIGNAL,SECURITY,SSID device wifi list --rescan no 2> /dev/null) || out=
    {
        echo "updated=$(date +%s)"
        printf '%s\n' "$out" | parse_networks
    } > "$tmp" && mv -f "$tmp" "$NETWORKS"
}

# $1 status, $2 SSID, $3 message. Atomic, so olad never reads half of it.
write_result() {
    tmp=$RESULT.$$
    {
        echo "time=$(date +%s)"
        echo "status=$1"
        printf 'ssid=%s\n' "$2"
        printf 'message=%s\n' "$3"
    } > "$tmp" && mv -f "$tmp" "$RESULT"
}

connect() {
    ssid=$1 pass=$2 hidden=$3
    if [ -z "$ssid" ]; then
        write_result failed "" "No network name"
        return
    fi
    write_result connecting "$ssid" ""
    "$RFKILL" unblock wifi
    # The password is handed to nmcli as an argument, so it is visible to local users in the
    # process list for the few seconds this takes. This machine has no other users.
    if [ "$hidden" = hidden ]; then
        set -- device wifi connect "$ssid" hidden yes
    else
        set -- device wifi connect "$ssid"
    fi
    [ -n "$pass" ] && set -- "$@" password "$pass"
    if msg=$("$NMCLI" --wait 45 "$@" 2>&1); then
        write_result ok "$ssid" "Connected"
    else
        # nmcli's message can echo the command; keep it to its first line and never the password.
        first=$(printf '%s\n' "$msg" | head -n 1)
        [ -n "$pass" ] && first=$(printf '%s' "$first" | sed "s|$(printf '%s' "$pass" | sed 's/[][\\.*^$|/]/\\&/g')|***|g")
        write_result failed "$ssid" "$first"
    fi
    scan
}

while :; do
    if present "$REQUEST_DIR/wifi"; then
        take "$REQUEST_DIR/wifi"
        case $l1 in
            on)
                echo "wifi: unblock"
                "$RFKILL" unblock wifi
                ;;
            off)
                echo "wifi: block"
                "$RFKILL" block wifi
                ;;
            *)
                echo "wifi: ignoring request"
                ;;
        esac
    fi
    if present "$REQUEST_DIR/scan"; then
        rm -f "$REQUEST_DIR/scan"
        echo "wifi: scan"
        scan
    fi
    if present "$REQUEST_DIR/connect"; then
        take "$REQUEST_DIR/connect"
        echo "wifi: connect"
        connect "$l1" "$l2" "$l3"
    fi
    sleep "$INTERVAL"
done
