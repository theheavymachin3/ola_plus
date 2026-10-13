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
  return s;
}
}  // namespace ola
