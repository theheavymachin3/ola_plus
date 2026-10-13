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
 * SystemStats.h
 * Health of the machine olad runs on (temperature, load, memory, and on a
 * Raspberry Pi the power and throttling state) for the web UI.
 */

#ifndef OLAD_SYSTEMSTATS_H_
#define OLAD_SYSTEMSTATS_H_

#include <time.h>
#include <map>
#include <string>

namespace ola {

/**
 * @brief Readings that only the Raspberry Pi firmware knows (voltages, throttling).
 *
 * olad doesn't talk to the firmware itself: that needs a privileged group and an
 * external tool. A small service of the ola-plus package runs vcgencmd and writes the
 * results to FIRMWARE_FILE, which olad only reads.
 */
struct FirmwareReadings {
  unsigned int age_s;                    /**< Seconds since the file was written. */
  std::map<std::string, double> volts;   /**< "core", "sdram_c", "sdram_i", "sdram_p" */
  bool has_throttled;
  unsigned int throttled;                /**< vcgencmd get_throttled bit field. */
  bool has_arm_clock;
  unsigned long arm_clock_hz;

  FirmwareReadings()
      : age_s(0), has_throttled(false), throttled(0), has_arm_clock(false),
        arm_clock_hz(0) {}
};

/**
 * @brief A snapshot of the host's health. Every value is optional: what the platform
 * doesn't offer is simply absent.
 */
struct SystemSnapshot {
  std::string platform;  /**< "raspberry-pi", "linux" or "other" */
  std::string model;

  bool has_cpu_temp;
  double cpu_temp_c;
  bool has_cpu_freq;
  unsigned int cpu_freq_mhz;
  unsigned int cpu_max_freq_mhz;
  bool has_undervoltage_alarm;  /**< The kernel's under-voltage alarm is set right now. */
  bool undervoltage_alarm;
  bool has_load;
  double load[3];
  bool has_mem;
  unsigned long mem_total_kb;
  unsigned long mem_available_kb;
  bool has_uptime;
  unsigned long uptime_s;
  bool has_firmware;
  FirmwareReadings firmware;

  SystemSnapshot()
      : has_cpu_temp(false), cpu_temp_c(0), has_cpu_freq(false),
        cpu_freq_mhz(0), cpu_max_freq_mhz(0), has_undervoltage_alarm(false),
        undervoltage_alarm(false), has_load(false), has_mem(false),
        mem_total_kb(0), mem_available_kb(0), has_uptime(false), uptime_s(0),
        has_firmware(false) {
    load[0] = load[1] = load[2] = 0;
  }
};

/**
 * @brief Reads the snapshot from /sys, /proc and the firmware readings file.
 *
 * The parsers are static and take text, so they can be tested without a Raspberry.
 * `root` is prepended to every path (for tests; empty means the real system).
 */
class SystemStats {
 public:
  /** Where the ola-plus firmware reader writes its readings. */
  static const char FIRMWARE_FILE[];
  /** Readings older than this are not shown: the reader has stopped. */
  static const unsigned int FIRMWARE_MAX_AGE_S = 30;

  explicit SystemStats(const std::string &root = "") : m_root(root) {}

  SystemSnapshot Read(time_t now) const;

  // Parsers. Each returns false if the text isn't what it expects.
  static bool ParseMilliCelsius(const std::string &text, double *celsius);
  static bool ParseLoadAvg(const std::string &text, double load[3]);
  static bool ParseMemInfo(const std::string &text,
                           unsigned long *total_kb,
                           unsigned long *available_kb);
  static bool ParseUptime(const std::string &text, unsigned long *seconds);
  static bool ParseFirmware(const std::string &text, time_t now,
                            FirmwareReadings *out);

 private:
  std::string m_root;

  bool ReadFile(const std::string &path, std::string *content) const;
};
}  // namespace ola
#endif  // OLAD_SYSTEMSTATS_H_
