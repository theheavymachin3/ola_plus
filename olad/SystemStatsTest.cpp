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
 * SystemStatsTest.cpp
 * Unittest for the host health readings.
 */

#include <cppunit/extensions/HelperMacros.h>
#include <string>

#include "olad/SystemStats.h"
#include "ola/testing/TestUtils.h"

using ola::FirmwareReadings;
using ola::SystemSnapshot;
using ola::SystemStats;
using ola::WifiScan;
using std::string;

class SystemStatsTest: public CppUnit::TestFixture {
  CPPUNIT_TEST_SUITE(SystemStatsTest);
  CPPUNIT_TEST(testTemperature);
  CPPUNIT_TEST(testLoadAvg);
  CPPUNIT_TEST(testMemInfo);
  CPPUNIT_TEST(testUptime);
  CPPUNIT_TEST(testFirmware);
  CPPUNIT_TEST(testFirmwareTooOld);
  CPPUNIT_TEST(testRfkillFlag);
  CPPUNIT_TEST(testOperstate);
  CPPUNIT_TEST(testWifiNetworks);
  CPPUNIT_TEST(testWifiResult);
  CPPUNIT_TEST(testMissingRoot);
  CPPUNIT_TEST_SUITE_END();

 public:
  void testTemperature();
  void testLoadAvg();
  void testMemInfo();
  void testUptime();
  void testFirmware();
  void testFirmwareTooOld();
  void testRfkillFlag();
  void testOperstate();
  void testWifiNetworks();
  void testWifiResult();
  void testMissingRoot();
};

CPPUNIT_TEST_SUITE_REGISTRATION(SystemStatsTest);

void SystemStatsTest::testRfkillFlag() {
  bool blocked = false;
  OLA_ASSERT_TRUE(SystemStats::ParseRfkillFlag("1\n", &blocked));
  OLA_ASSERT_TRUE(blocked);
  OLA_ASSERT_TRUE(SystemStats::ParseRfkillFlag("0\n", &blocked));
  OLA_ASSERT_FALSE(blocked);
  OLA_ASSERT_FALSE(SystemStats::ParseRfkillFlag("", &blocked));
  OLA_ASSERT_FALSE(SystemStats::ParseRfkillFlag("2", &blocked));
}

void SystemStatsTest::testOperstate() {
  bool up = false;
  OLA_ASSERT_TRUE(SystemStats::ParseOperstate("up\n", &up));
  OLA_ASSERT_TRUE(up);
  OLA_ASSERT_TRUE(SystemStats::ParseOperstate("down\n", &up));
  OLA_ASSERT_FALSE(up);
  OLA_ASSERT_TRUE(SystemStats::ParseOperstate("dormant\n", &up));
  OLA_ASSERT_FALSE(up);
  OLA_ASSERT_FALSE(SystemStats::ParseOperstate("", &up));
}

void SystemStatsTest::testWifiNetworks() {
  WifiScan scan;
  OLA_ASSERT_TRUE(SystemStats::ParseWifiNetworks(
      "updated=990\nnet\t1\t78\tWPA2\tHome: Net\nnet\t0\t30\t--\tOpen\n"
      "junk\nnet\t0\t20\tWPA2\t\n",
      1000, &scan));
  OLA_ASSERT_TRUE(scan.has_scan);
  OLA_ASSERT_EQ(10u, scan.scan_age_s);
  OLA_ASSERT_EQ(static_cast<size_t>(2), scan.networks.size());
  OLA_ASSERT_EQ(string("Home: Net"), scan.networks[0].ssid);
  OLA_ASSERT_TRUE(scan.networks[0].in_use);
  OLA_ASSERT_EQ(78u, scan.networks[0].signal);
  OLA_ASSERT_EQ(string("--"), scan.networks[1].security);
  OLA_ASSERT_FALSE(SystemStats::ParseWifiNetworks("net\t0\t1\tWPA2\tx\n",
                                                  1000, &scan));
}

void SystemStatsTest::testWifiResult() {
  WifiScan scan;
  OLA_ASSERT_TRUE(SystemStats::ParseWifiResult(
      "time=995\nstatus=failed\nssid=Stage\nmessage=Error: no secrets\n",
      1000, &scan));
  OLA_ASSERT_TRUE(scan.has_result);
  OLA_ASSERT_EQ(5u, scan.result_age_s);
  OLA_ASSERT_EQ(string("failed"), scan.status);
  OLA_ASSERT_EQ(string("Stage"), scan.ssid);
  OLA_ASSERT_EQ(string("Error: no secrets"), scan.message);
  OLA_ASSERT_FALSE(SystemStats::ParseWifiResult("time=1\nstatus=weird\n",
                                                1000, &scan));
}

void SystemStatsTest::testTemperature() {
  double c = 0;
  OLA_ASSERT_TRUE(SystemStats::ParseMilliCelsius("52088\n", &c));
  OLA_ASSERT_TRUE(c > 52.0 && c < 52.1);
  OLA_ASSERT_FALSE(SystemStats::ParseMilliCelsius("", &c));
  OLA_ASSERT_FALSE(SystemStats::ParseMilliCelsius("hot", &c));
}

void SystemStatsTest::testLoadAvg() {
  double load[3] = {0, 0, 0};
  OLA_ASSERT_TRUE(SystemStats::ParseLoadAvg("0.52 0.40 0.31 1/123 4567\n", load));
  OLA_ASSERT_TRUE(load[0] > 0.51 && load[0] < 0.53);
  OLA_ASSERT_TRUE(load[2] > 0.30 && load[2] < 0.32);
  OLA_ASSERT_FALSE(SystemStats::ParseLoadAvg("0.52 0.40", load));
  OLA_ASSERT_FALSE(SystemStats::ParseLoadAvg("a b c", load));
}

void SystemStatsTest::testMemInfo() {
  unsigned long total = 0, available = 0;
  const string text =
      "MemTotal:         942116 kB\n"
      "MemFree:          310000 kB\n"
      "MemAvailable:     612340 kB\n";
  OLA_ASSERT_TRUE(SystemStats::ParseMemInfo(text, &total, &available));
  OLA_ASSERT_EQ(942116ul, total);
  OLA_ASSERT_EQ(612340ul, available);
  // No MemAvailable (very old kernel): not usable.
  OLA_ASSERT_FALSE(
      SystemStats::ParseMemInfo("MemTotal: 10 kB\nMemFree: 5 kB\n", &total,
                                &available));
}

void SystemStatsTest::testUptime() {
  unsigned long s = 0;
  OLA_ASSERT_TRUE(SystemStats::ParseUptime("12345.67 9999.00\n", &s));
  OLA_ASSERT_EQ(12345ul, s);
  OLA_ASSERT_FALSE(SystemStats::ParseUptime("", &s));
  OLA_ASSERT_FALSE(SystemStats::ParseUptime("x", &s));
}

void SystemStatsTest::testFirmware() {
  const string text =
      "volts_core=1.2000\n"
      "volts_sdram_c=1.2000\n"
      "volts_sdram_i=1.2000\n"
      "volts_sdram_p=1.2250\n"
      "throttled=0x50005\n"
      "arm_clock_hz=600062000\n"
      "updated=1000\n";
  FirmwareReadings r;
  OLA_ASSERT_TRUE(SystemStats::ParseFirmware(text, 1004, &r));
  OLA_ASSERT_EQ(4u, r.age_s);
  OLA_ASSERT_EQ(static_cast<size_t>(4), r.volts.size());
  OLA_ASSERT_TRUE(r.volts["sdram_p"] > 1.224 && r.volts["sdram_p"] < 1.226);
  OLA_ASSERT_TRUE(r.has_throttled);
  OLA_ASSERT_EQ(0x50005u, r.throttled);
  OLA_ASSERT_TRUE(r.has_arm_clock);
  OLA_ASSERT_EQ(600062000ul, r.arm_clock_hz);

  // A partial file is fine: what is missing stays missing.
  FirmwareReadings partial;
  OLA_ASSERT_TRUE(SystemStats::ParseFirmware("throttled=0\nupdated=10\n", 10,
                                             &partial));
  OLA_ASSERT_TRUE(partial.has_throttled);
  OLA_ASSERT_EQ(0u, partial.throttled);
  OLA_ASSERT_TRUE(partial.volts.empty());
  OLA_ASSERT_FALSE(partial.has_arm_clock);
}

void SystemStatsTest::testFirmwareTooOld() {
  FirmwareReadings r;
  // Fresh enough at the limit, stale one second later.
  OLA_ASSERT_TRUE(SystemStats::ParseFirmware("throttled=0\nupdated=100\n", 130,
                                             &r));
  OLA_ASSERT_FALSE(SystemStats::ParseFirmware("throttled=0\nupdated=100\n", 131,
                                              &r));
  // No timestamp means we can't say how old it is.
  OLA_ASSERT_FALSE(SystemStats::ParseFirmware("throttled=0\n", 100, &r));
  // A clock that went backwards doesn't produce a negative age.
  OLA_ASSERT_TRUE(SystemStats::ParseFirmware("throttled=0\nupdated=200\n", 100,
                                             &r));
  OLA_ASSERT_EQ(0u, r.age_s);
}

void SystemStatsTest::testMissingRoot() {
  SystemStats stats(string(TEST_BUILD_DIR) + "/does-not-exist");
  SystemSnapshot s = stats.Read(1000);
  OLA_ASSERT_EQ(string("other"), s.platform);
  OLA_ASSERT_FALSE(s.has_cpu_temp);
  OLA_ASSERT_FALSE(s.has_load);
  OLA_ASSERT_FALSE(s.has_mem);
  OLA_ASSERT_FALSE(s.has_undervoltage_alarm);
  OLA_ASSERT_FALSE(s.has_wifi);
  OLA_ASSERT_FALSE(s.has_ethernet);
}
