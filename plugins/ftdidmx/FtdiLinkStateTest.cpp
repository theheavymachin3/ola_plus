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
 * FtdiLinkStateTest.cpp
 * Unittest for the FTDI link state tracker.
 */

#include <cppunit/extensions/HelperMacros.h>

#include "plugins/ftdidmx/FtdiLinkState.h"
#include "ola/testing/TestUtils.h"

using ola::plugin::ftdidmx::FtdiLinkState;

class FtdiLinkStateTest: public CppUnit::TestFixture {
  CPPUNIT_TEST_SUITE(FtdiLinkStateTest);
  CPPUNIT_TEST(testWorkingLinkIsQuiet);
  CPPUNIT_TEST(testLossIsReportedOnce);
  CPPUNIT_TEST(testRetriesAreSpacedOut);
  CPPUNIT_TEST(testRecovery);
  CPPUNIT_TEST_SUITE_END();

 public:
  void testWorkingLinkIsQuiet();
  void testLossIsReportedOnce();
  void testRetriesAreSpacedOut();
  void testRecovery();
};

CPPUNIT_TEST_SUITE_REGISTRATION(FtdiLinkStateTest);

void FtdiLinkStateTest::testWorkingLinkIsQuiet() {
  FtdiLinkState s;
  for (int i = 0; i < 5; i++) {
    OLA_ASSERT_EQ(FtdiLinkState::NONE, s.FrameResult(true, i * 25));
  }
  OLA_ASSERT_FALSE(s.Failing());
  OLA_ASSERT_FALSE(s.ShouldReconnect(100000));
}

void FtdiLinkStateTest::testLossIsReportedOnce() {
  FtdiLinkState s;
  OLA_ASSERT_EQ(FtdiLinkState::LOST, s.FrameResult(false, 0));
  OLA_ASSERT_TRUE(s.Failing());
  for (int i = 1; i < 1000; i++) {
    OLA_ASSERT_EQ(FtdiLinkState::NONE, s.FrameResult(false, i * 25));
  }
}

void FtdiLinkStateTest::testRetriesAreSpacedOut() {
  FtdiLinkState s(1000);
  s.FrameResult(false, 5000);
  OLA_ASSERT_FALSE(s.ShouldReconnect(5000));
  OLA_ASSERT_FALSE(s.ShouldReconnect(5999));
  OLA_ASSERT_TRUE(s.ShouldReconnect(6000));
  // The attempt just made counts: wait a whole interval again.
  OLA_ASSERT_FALSE(s.ShouldReconnect(6500));
  OLA_ASSERT_TRUE(s.ShouldReconnect(7000));
}

void FtdiLinkStateTest::testRecovery() {
  FtdiLinkState s;
  s.FrameResult(false, 0);
  OLA_ASSERT_EQ(FtdiLinkState::RECOVERED, s.FrameResult(true, 2000));
  OLA_ASSERT_FALSE(s.Failing());
  OLA_ASSERT_EQ(FtdiLinkState::NONE, s.FrameResult(true, 2025));
  // A second outage is reported again.
  OLA_ASSERT_EQ(FtdiLinkState::LOST, s.FrameResult(false, 3000));
}
