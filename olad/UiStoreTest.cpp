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
 * UiStoreTest.cpp
 * Unittest for the UI document store.
 */

#include <cppunit/extensions/HelperMacros.h>
#include <stdio.h>
#include <string>

#include "olad/UiStore.h"
#include "ola/testing/TestUtils.h"

using ola::UiStore;
using std::string;

class UiStoreTest: public CppUnit::TestFixture {
  CPPUNIT_TEST_SUITE(UiStoreTest);
  CPPUNIT_TEST(testKeyValidation);
  CPPUNIT_TEST(testNeverSavedIsEmpty);
  CPPUNIT_TEST(testSaveAndReadBack);
  CPPUNIT_TEST(testRevisionsAndConflicts);
  CPPUNIT_TEST(testRejectsBadData);
  CPPUNIT_TEST(testPersistsAcrossInstances);
  CPPUNIT_TEST(testKeysAreIndependent);
  CPPUNIT_TEST_SUITE_END();

 public:
  void setUp();
  void tearDown();
  void testKeyValidation();
  void testNeverSavedIsEmpty();
  void testSaveAndReadBack();
  void testRevisionsAndConflicts();
  void testRejectsBadData();
  void testPersistsAcrossInstances();
  void testKeysAreIndependent();

 private:
  void Cleanup();
};

CPPUNIT_TEST_SUITE_REGISTRATION(UiStoreTest);

// Keys used by these tests, so they can be removed before and after.
static const char *const TEST_KEYS[] = {"unittest-a", "unittest-b"};

void UiStoreTest::Cleanup() {
  for (unsigned int i = 0; i < sizeof(TEST_KEYS) / sizeof(TEST_KEYS[0]); i++) {
    const string path = string(TEST_BUILD_DIR) + "/ola-ui-" + TEST_KEYS[i] +
                        ".json";
    remove(path.c_str());
    remove((path + ".tmp").c_str());
  }
}

void UiStoreTest::setUp() { Cleanup(); }
void UiStoreTest::tearDown() { Cleanup(); }

void UiStoreTest::testKeyValidation() {
  OLA_ASSERT_TRUE(UiStore::IsValidKey("scenes"));
  OLA_ASSERT_TRUE(UiStore::IsValidKey("fixtures-2_a"));
  OLA_ASSERT_FALSE(UiStore::IsValidKey(""));
  OLA_ASSERT_FALSE(UiStore::IsValidKey("../etc/passwd"));
  OLA_ASSERT_FALSE(UiStore::IsValidKey("a/b"));
  OLA_ASSERT_FALSE(UiStore::IsValidKey("a\\b"));
  OLA_ASSERT_FALSE(UiStore::IsValidKey("Scenes"));  // upper case
  OLA_ASSERT_FALSE(UiStore::IsValidKey("a.b"));
  OLA_ASSERT_FALSE(UiStore::IsValidKey(string(33, 'a')));
  OLA_ASSERT_TRUE(UiStore::IsValidKey(string(32, 'a')));
}

void UiStoreTest::testNeverSavedIsEmpty() {
  UiStore store(TEST_BUILD_DIR);
  UiStore::Document doc;
  OLA_ASSERT_TRUE(store.Get("unittest-a", &doc));
  OLA_ASSERT_EQ(0u, doc.revision);
  OLA_ASSERT_EQ(string(""), doc.data);
  OLA_ASSERT_FALSE(store.Get("../x", &doc));
}

void UiStoreTest::testSaveAndReadBack() {
  UiStore store(TEST_BUILD_DIR);
  unsigned int rev = 99;
  OLA_ASSERT_EQ(UiStore::SAVED,
                store.Save("unittest-a", 0, "[{\"id\":\"x\",\"n\":1}]", &rev));
  OLA_ASSERT_EQ(1u, rev);

  UiStore::Document doc;
  OLA_ASSERT_TRUE(store.Get("unittest-a", &doc));
  OLA_ASSERT_EQ(1u, doc.revision);
  OLA_ASSERT_EQ(string("[{\"id\":\"x\",\"n\":1}]"), doc.data);
}

void UiStoreTest::testRevisionsAndConflicts() {
  UiStore store(TEST_BUILD_DIR);
  unsigned int rev = 0;
  OLA_ASSERT_EQ(UiStore::SAVED, store.Save("unittest-a", 0, "[1]", &rev));
  OLA_ASSERT_EQ(UiStore::SAVED, store.Save("unittest-a", 1, "[2]", &rev));
  OLA_ASSERT_EQ(2u, rev);

  // A stale writer (still on revision 1) is refused and changes nothing.
  OLA_ASSERT_EQ(UiStore::CONFLICT, store.Save("unittest-a", 1, "[3]", &rev));
  // So is one that thinks the key is new.
  OLA_ASSERT_EQ(UiStore::CONFLICT, store.Save("unittest-a", 0, "[3]", &rev));

  UiStore::Document doc;
  OLA_ASSERT_TRUE(store.Get("unittest-a", &doc));
  OLA_ASSERT_EQ(2u, doc.revision);
  OLA_ASSERT_EQ(string("[2]"), doc.data);
}

void UiStoreTest::testRejectsBadData() {
  UiStore store(TEST_BUILD_DIR);
  unsigned int rev = 0;
  OLA_ASSERT_EQ(UiStore::INVALID_DATA, store.Save("unittest-a", 0, "{nope", &rev));
  OLA_ASSERT_EQ(UiStore::INVALID_DATA, store.Save("unittest-a", 0, "", &rev));
  OLA_ASSERT_EQ(UiStore::INVALID_KEY, store.Save("../x", 0, "[]", &rev));
  OLA_ASSERT_EQ(UiStore::TOO_LARGE,
                store.Save("unittest-a", 0,
                           "[\"" + string(UiStore::MAX_DOCUMENT_BYTES, 'a') +
                           "\"]",
                           &rev));
  // None of that may have created a document.
  UiStore::Document doc;
  OLA_ASSERT_TRUE(store.Get("unittest-a", &doc));
  OLA_ASSERT_EQ(0u, doc.revision);
}

void UiStoreTest::testPersistsAcrossInstances() {
  unsigned int rev = 0;
  OLA_ASSERT_EQ(UiStore::SAVED,
                UiStore(TEST_BUILD_DIR).Save("unittest-a", 0, "[\"kept\"]", &rev));
  UiStore::Document doc;
  OLA_ASSERT_TRUE(UiStore(TEST_BUILD_DIR).Get("unittest-a", &doc));
  OLA_ASSERT_EQ(1u, doc.revision);
  OLA_ASSERT_EQ(string("[\"kept\"]"), doc.data);
}

void UiStoreTest::testKeysAreIndependent() {
  UiStore store(TEST_BUILD_DIR);
  unsigned int rev = 0;
  OLA_ASSERT_EQ(UiStore::SAVED, store.Save("unittest-a", 0, "[\"a\"]", &rev));
  OLA_ASSERT_EQ(UiStore::SAVED, store.Save("unittest-b", 0, "[\"b\"]", &rev));
  UiStore::Document a, b;
  OLA_ASSERT_TRUE(store.Get("unittest-a", &a));
  OLA_ASSERT_TRUE(store.Get("unittest-b", &b));
  OLA_ASSERT_EQ(string("[\"a\"]"), a.data);
  OLA_ASSERT_EQ(string("[\"b\"]"), b.data);
}
