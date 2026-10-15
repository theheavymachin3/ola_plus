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
#include <vector>

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
 * @brief State of the Wi-Fi radio, as the kernel's rfkill reports it.
 *
 * Switching it needs root, so olad only leaves a request for the ola-plus-net service
 * (see RequestWifi); `controllable` says that service is there to answer.
 */
struct WifiState {
  bool enabled;       /**< Neither software- nor hardware-blocked. */
  bool hard_blocked;  /**< A physical switch holds it off; software can't change that. */
  bool controllable;  /**< The ola-plus-net service is running and can switch it. */

  WifiState() : enabled(false), hard_blocked(false), controllable(false) {}
};

/** @brief One Wi-Fi network in range, as the ola-plus-net service listed it. */
struct WifiNetwork {
  std::string ssid;
  unsigned int signal;    /**< 0 - 100 */
  std::string security;   /**< "--" for an open network, else e.g. "WPA2", "WPA3". */
  bool in_use;            /**< The machine is connected to it. */

  WifiNetwork() : signal(0), in_use(false) {}
};

/** @brief The last scan and the last attempt to join a network. */
struct WifiScan {
  bool has_scan;
  unsigned int scan_age_s;
  std::vector<WifiNetwork> networks;

  bool has_result;
  unsigned int result_age_s;
  std::string status;   /**< "connecting", "ok" or "failed" */
  std::string ssid;
  std::string message;

  WifiScan()
      : has_scan(false), scan_age_s(0), has_result(false), result_age_s(0) {}
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
  bool has_wifi;  /**< The machine has a Wi-Fi radio. */
  WifiState wifi;

  SystemSnapshot()
      : has_cpu_temp(false), cpu_temp_c(0), has_cpu_freq(false),
        cpu_freq_mhz(0), cpu_max_freq_mhz(0), has_undervoltage_alarm(false),
        undervoltage_alarm(false), has_load(false), has_mem(false),
        mem_total_kb(0), mem_available_kb(0), has_uptime(false), uptime_s(0),
        has_firmware(false), has_wifi(false) {
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
  /** Where olad leaves a request for the ola-plus-net service (group-writable by olad). */
  static const char WIFI_REQUEST_DIR[];
  /** Where the ola-plus-net service writes the network list and the last join result. */
  static const char WIFI_STATE_DIR[];

  explicit SystemStats(const std::string &root = "") : m_root(root) {}

  SystemSnapshot Read(time_t now) const;

  /**
   * @brief Ask the ola-plus-net service to switch the Wi-Fi radio on or off.
   * @returns false if the service isn't there or the request couldn't be written.
   */
  bool RequestWifi(bool on) const;

  /** @brief Ask the service to rescan; the list appears in ReadWifiScan a few seconds later. */
  bool RequestWifiScan() const;

  /**
   * @brief Ask the service to join a network. The password is written to a file only the
   * service (root) and olad can read, which the service deletes as soon as it has read it.
   * @param password empty for an open network.
   */
  bool RequestWifiConnect(const std::string &ssid, const std::string &password,
                          bool hidden) const;

  WifiScan ReadWifiScan(time_t now) const;

  // Parsers. Each returns false if the text isn't what it expects.
  static bool ParseMilliCelsius(const std::string &text, double *celsius);
  static bool ParseLoadAvg(const std::string &text, double load[3]);
  static bool ParseMemInfo(const std::string &text,
                           unsigned long *total_kb,
                           unsigned long *available_kb);
  static bool ParseUptime(const std::string &text, unsigned long *seconds);
  /** @brief "1" -> true, "0" -> false (rfkill's soft and hard files). */
  static bool ParseRfkillFlag(const std::string &text, bool *blocked);
  static bool ParseWifiNetworks(const std::string &text, time_t now,
                                WifiScan *out);
  static bool ParseWifiResult(const std::string &text, time_t now,
                              WifiScan *out);
  static bool ParseFirmware(const std::string &text, time_t now,
                            FirmwareReadings *out);

 private:
  std::string m_root;

  bool ReadFile(const std::string &path, std::string *content) const;
  bool WriteRequest(const std::string &name, const std::string &content) const;
};
}  // namespace ola
#endif  // OLAD_SYSTEMSTATS_H_
