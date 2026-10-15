/*
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA
 *
 * SystemStats.cpp
 * Health of the machine olad runs on, for the web UI.
 */

#include "olad/SystemStats.h"

#include <errno.h>
#ifndef _WIN32
#include <fcntl.h>
#include <unistd.h>
#endif  // _WIN32
#include <stdio.h>
#include <stdlib.h>
#include <ola/file/Util.h>

#include <fstream>
#include <sstream>
#include <string>
#include <vector>

namespace ola {

using std::string;
using std::vector;

const char SystemStats::FIRMWARE_FILE[] = "/run/ola-plus/firmware.txt";
const char SystemStats::WIFI_REQUEST_DIR[] = "/run/ola-plus-net/request";
const char SystemStats::WIFI_STATE_DIR[] = "/run/ola-plus-net";

namespace {

string Trim(const string &s) {
  const char *ws = " \t\r\n\0";
  string::size_type b = s.find_first_not_of(ws, 0, 5);
  if (b == string::npos) {
    return "";
  }
  string::size_type e = s.find_last_not_of(ws, string::npos, 5);
  return s.substr(b, e - b + 1);
}

bool ToDouble(const string &text, double *out) {
  if (text.empty()) {
    return false;
  }
  errno = 0;
  char *end = NULL;
  double v = strtod(text.c_str(), &end);
  if (errno != 0 || end == text.c_str() || *end != '\0') {
    return false;
  }
  *out = v;
  return true;
}

bool ToULong(const string &text, int base, unsigned long *out) {
  if (text.empty() || text[0] == '-') {
    return false;
  }
  errno = 0;
  char *end = NULL;
  unsigned long v = strtoul(text.c_str(), &end, base);
  if (errno != 0 || end == text.c_str() || *end != '\0') {
    return false;
  }
  *out = v;
  return true;
}

// "MemTotal:  942116 kB" -> 942116
bool MemInfoValue(const string &line, const string &key, unsigned long *out) {
  if (line.compare(0, key.size(), key) != 0 || line.size() <= key.size() ||
      line[key.size()] != ':') {
    return false;
  }
  std::istringstream in(line.substr(key.size() + 1));
  string number;
  in >> number;
  return ToULong(number, 10, out);
}
}  // namespace

bool SystemStats::ParseMilliCelsius(const string &text, double *celsius) {
  double milli;
  if (!ToDouble(Trim(text), &milli)) {
    return false;
  }
  *celsius = milli / 1000.0;
  return true;
}

bool SystemStats::ParseLoadAvg(const string &text, double load[3]) {
  std::istringstream in(text);
  string a, b, c;
  if (!(in >> a >> b >> c)) {
    return false;
  }
  return ToDouble(a, &load[0]) && ToDouble(b, &load[1]) && ToDouble(c, &load[2]);
}

bool SystemStats::ParseMemInfo(const string &text, unsigned long *total_kb,
                               unsigned long *available_kb) {
  std::istringstream in(text);
  string line;
  bool have_total = false, have_available = false;
  unsigned long total = 0, available = 0;
  while (std::getline(in, line)) {
    have_total = have_total || MemInfoValue(line, "MemTotal", &total);
    have_available = have_available ||
                     MemInfoValue(line, "MemAvailable", &available);
  }
  if (!have_total || !have_available) {
    return false;
  }
  *total_kb = total;
  *available_kb = available;
  return true;
}

bool SystemStats::ParseUptime(const string &text, unsigned long *seconds) {
  std::istringstream in(text);
  string first;
  if (!(in >> first)) {
    return false;
  }
  double s;
  if (!ToDouble(first, &s) || s < 0) {
    return false;
  }
  *seconds = static_cast<unsigned long>(s);
  return true;
}

bool SystemStats::ParseRfkillFlag(const string &text, bool *blocked) {
  const string t = Trim(text);
  if (t != "0" && t != "1") {
    return false;
  }
  *blocked = t == "1";
  return true;
}

bool SystemStats::ParseWifiNetworks(const string &text, time_t now,
                                    WifiScan *out) {
  WifiScan r = *out;
  r.networks.clear();
  bool have_updated = false;
  unsigned long updated = 0;

  std::istringstream in(text);
  string line;
  while (std::getline(in, line)) {
    if (line.compare(0, 8, "updated=") == 0) {
      have_updated = ToULong(Trim(line.substr(8)), 10, &updated);
      continue;
    }
    // "net<TAB>in_use<TAB>signal<TAB>security<TAB>ssid"; the SSID is the rest of the line.
    vector<string> f;
    string::size_type start = 0;
    for (int i = 0; i < 4; i++) {
      string::size_type tab = line.find('\t', start);
      if (tab == string::npos) {
        break;
      }
      f.push_back(line.substr(start, tab - start));
      start = tab + 1;
    }
    unsigned long in_use, signal;
    if (f.size() != 4 || f[0] != "net" || !ToULong(f[1], 10, &in_use) ||
        !ToULong(f[2], 10, &signal) || start >= line.size()) {
      continue;
    }
    WifiNetwork n;
    n.in_use = in_use != 0;
    n.signal = signal > 100 ? 100 : static_cast<unsigned int>(signal);
    n.security = f[3];
    n.ssid = line.substr(start);
    r.networks.push_back(n);
  }
  if (!have_updated) {
    return false;
  }
  const long age = static_cast<long>(now) - static_cast<long>(updated);
  r.has_scan = true;
  r.scan_age_s = age < 0 ? 0 : static_cast<unsigned int>(age);
  *out = r;
  return true;
}

bool SystemStats::ParseWifiResult(const string &text, time_t now,
                                  WifiScan *out) {
  string status, ssid, message;
  bool have_time = false;
  unsigned long when = 0;
  std::istringstream in(text);
  string line;
  while (std::getline(in, line)) {
    string::size_type eq = line.find('=');
    if (eq == string::npos) {
      continue;
    }
    const string key = line.substr(0, eq);
    const string value = line.substr(eq + 1);
    if (key == "time") {
      have_time = ToULong(Trim(value), 10, &when);
    } else if (key == "status") {
      status = Trim(value);
    } else if (key == "ssid") {
      ssid = value;
    } else if (key == "message") {
      message = value;
    }
  }
  if (!have_time ||
      (status != "connecting" && status != "ok" && status != "failed")) {
    return false;
  }
  const long age = static_cast<long>(now) - static_cast<long>(when);
  out->has_result = true;
  out->result_age_s = age < 0 ? 0 : static_cast<unsigned int>(age);
  out->status = status;
  out->ssid = ssid;
  out->message = message;
  return true;
}

bool SystemStats::ParseFirmware(const string &text, time_t now,
                                FirmwareReadings *out) {
  FirmwareReadings r;
  bool have_updated = false;
  unsigned long updated = 0;

  std::istringstream in(text);
  string line;
  while (std::getline(in, line)) {
    string::size_type eq = line.find('=');
    if (eq == string::npos) {
      continue;
    }
    const string key = Trim(line.substr(0, eq));
    const string value = Trim(line.substr(eq + 1));
    double d;
    unsigned long u;
    if (key.compare(0, 6, "volts_") == 0 && ToDouble(value, &d)) {
      r.volts[key.substr(6)] = d;
    } else if (key == "throttled" && ToULong(value, 0, &u)) {
      r.has_throttled = true;
      r.throttled = static_cast<unsigned int>(u);
    } else if (key == "arm_clock_hz" && ToULong(value, 10, &u)) {
      r.has_arm_clock = true;
      r.arm_clock_hz = u;
    } else if (key == "updated" && ToULong(value, 10, &u)) {
      have_updated = true;
      updated = u;
    }
  }
  if (!have_updated) {
    return false;  // We can't tell how old it is, so don't trust it.
  }
  const long age = static_cast<long>(now) - static_cast<long>(updated);
  if (age > static_cast<long>(FIRMWARE_MAX_AGE_S)) {
    return false;
  }
  r.age_s = age < 0 ? 0 : static_cast<unsigned int>(age);
  *out = r;
  return true;
}

bool SystemStats::ReadFile(const string &path, string *content) const {
  std::ifstream in((m_root + path).c_str());
  if (!in.is_open()) {
    return false;
  }
  std::ostringstream buffer;
  buffer << in.rdbuf();
  *content = buffer.str();
  return true;
}

SystemSnapshot SystemStats::Read(time_t now) const {
  SystemSnapshot s;
  string text;

  s.platform = "other";
  if (ReadFile("/proc/device-tree/model", &text)) {
    s.model = Trim(text);  // The file ends with a NUL, which Trim removes.
  }
  if (s.model.compare(0, 12, "Raspberry Pi") == 0) {
    s.platform = "raspberry-pi";
  } else if (ReadFile("/proc/loadavg", &text)) {
    s.platform = "linux";
  }

  // CPU temperature: the first thermal zone (on a Pi that is the SoC).
  if (ReadFile("/sys/class/thermal/thermal_zone0/temp", &text)) {
    s.has_cpu_temp = ParseMilliCelsius(text, &s.cpu_temp_c);
  }

  unsigned long khz;
  if (ReadFile("/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq", &text) &&
      ToULong(Trim(text), 10, &khz)) {
    s.has_cpu_freq = true;
    s.cpu_freq_mhz = static_cast<unsigned int>(khz / 1000);
    if (ReadFile("/sys/devices/system/cpu/cpu0/cpufreq/cpuinfo_max_freq",
                 &text) && ToULong(Trim(text), 10, &khz)) {
      s.cpu_max_freq_mhz = static_cast<unsigned int>(khz / 1000);
    }
  }

  // The Raspberry Pi hwmon driver exposes the under-voltage alarm.
  vector<string> hwmons;
  if (ola::file::ListDirectory(m_root + "/sys/class/hwmon", &hwmons)) {
    for (vector<string>::const_iterator i = hwmons.begin(); i != hwmons.end();
         ++i) {
      const string dir = "/sys/class/hwmon/" + ola::file::FilenameFromPath(*i);
      string name, alarm;
      if (ReadFile(dir + "/name", &name) && Trim(name) == "rpi_volt" &&
          ReadFile(dir + "/in0_lcrit_alarm", &alarm)) {
        s.has_undervoltage_alarm = true;
        s.undervoltage_alarm = Trim(alarm) == "1";
        break;
      }
    }
  }

  if (ReadFile("/proc/loadavg", &text)) {
    s.has_load = ParseLoadAvg(text, s.load);
  }
  if (ReadFile("/proc/meminfo", &text)) {
    s.has_mem = ParseMemInfo(text, &s.mem_total_kb, &s.mem_available_kb);
  }
  if (ReadFile("/proc/uptime", &text)) {
    s.has_uptime = ParseUptime(text, &s.uptime_s);
  }
  if (ReadFile(FIRMWARE_FILE, &text)) {
    s.has_firmware = ParseFirmware(text, now, &s.firmware);
  }

  // Wi-Fi: the first rfkill device of type "wlan".
  vector<string> rfkills;
  if (ola::file::ListDirectory(m_root + "/sys/class/rfkill", &rfkills)) {
    for (vector<string>::const_iterator i = rfkills.begin();
         i != rfkills.end(); ++i) {
      const string dir = "/sys/class/rfkill/" + ola::file::FilenameFromPath(*i);
      bool soft, hard;
      if (ReadFile(dir + "/type", &text) && Trim(text) == "wlan" &&
          ReadFile(dir + "/soft", &text) && ParseRfkillFlag(text, &soft) &&
          ReadFile(dir + "/hard", &text) && ParseRfkillFlag(text, &hard)) {
        s.has_wifi = true;
        s.wifi.hard_blocked = hard;
        s.wifi.enabled = !soft && !hard;
        vector<string> requests;
        s.wifi.controllable =
            ola::file::ListDirectory(m_root + WIFI_REQUEST_DIR, &requests);
        break;
      }
    }
  }
  return s;
}

bool SystemStats::WriteRequest(const string &name,
                               const string &content) const {
#ifdef _WIN32
  return false;
#else
  // Created with mode 0600 from the start (a password may be in it) under a temporary
  // name, then renamed, so the service never reads half a request.
  const string path = m_root + WIFI_REQUEST_DIR + "/" + name;
  const string tmp = path + ".tmp";
  unlink(tmp.c_str());
  int fd = open(tmp.c_str(), O_WRONLY | O_CREAT | O_EXCL, 0600);
  if (fd < 0) {
    return false;
  }
  size_t done = 0;
  while (done < content.size()) {
    ssize_t n = write(fd, content.data() + done, content.size() - done);
    if (n <= 0) {
      close(fd);
      unlink(tmp.c_str());
      return false;
    }
    done += n;
  }
  close(fd);
  if (rename(tmp.c_str(), path.c_str()) != 0) {
    unlink(tmp.c_str());
    return false;
  }
  return true;
#endif  // _WIN32
}

bool SystemStats::RequestWifi(bool on) const {
  return WriteRequest("wifi", on ? "on\n" : "off\n");
}

bool SystemStats::RequestWifiScan() const {
  return WriteRequest("scan", "scan\n");
}

bool SystemStats::RequestWifiConnect(const string &ssid, const string &password,
                                     bool hidden) const {
  return WriteRequest("connect",
                      ssid + "\n" + password + "\n" + (hidden ? "hidden" : "") + "\n");
}

WifiScan SystemStats::ReadWifiScan(time_t now) const {
  WifiScan scan;
  string text;
  if (ReadFile(string(WIFI_STATE_DIR) + "/networks.txt", &text)) {
    ParseWifiNetworks(text, now, &scan);
  }
  if (ReadFile(string(WIFI_STATE_DIR) + "/connect.txt", &text)) {
    ParseWifiResult(text, now, &scan);
  }
  return scan;
}
}  // namespace ola
