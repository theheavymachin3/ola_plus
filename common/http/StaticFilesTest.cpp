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
 * StaticFilesTest.cpp
 * Unittest for the static file URL helpers.
 */

#include <cppunit/extensions/HelperMacros.h>
#include <string>

#include "ola/http/StaticFiles.h"
#include "ola/testing/TestUtils.h"

using ola::http::ContentTypeForPath;
using ola::http::IsSinglePageRoute;
using ola::http::ResolveStaticUrl;
using ola::http::STATIC_URL_NOT_MATCHED;
using ola::http::STATIC_URL_OK;
using ola::http::STATIC_URL_REDIRECT;
using ola::http::STATIC_URL_REJECTED;
using std::string;

class StaticFilesTest: public CppUnit::TestFixture {
  CPPUNIT_TEST_SUITE(StaticFilesTest);
  CPPUNIT_TEST(testResolveBasics);
  CPPUNIT_TEST(testResolveRejectsTraversal);
  CPPUNIT_TEST(testContentTypes);
  CPPUNIT_TEST(testSinglePageRoutes);
  CPPUNIT_TEST_SUITE_END();

 public:
  void testResolveBasics();
  void testResolveRejectsTraversal();
  void testContentTypes();
  void testSinglePageRoutes();
};

CPPUNIT_TEST_SUITE_REGISTRATION(StaticFilesTest);

void StaticFilesTest::testResolveBasics() {
  string rel;
  OLA_ASSERT_EQ(STATIC_URL_OK, ResolveStaticUrl("/ui", "/ui/", &rel));
  OLA_ASSERT_EQ(string("index.html"), rel);

  OLA_ASSERT_EQ(STATIC_URL_OK,
                ResolveStaticUrl("/ui", "/ui/assets/app-1a2b.js", &rel));
  OLA_ASSERT_EQ(string("assets/app-1a2b.js"), rel);

  OLA_ASSERT_EQ(STATIC_URL_REDIRECT, ResolveStaticUrl("/ui", "/ui", &rel));
  OLA_ASSERT_EQ(STATIC_URL_NOT_MATCHED, ResolveStaticUrl("/ui", "/", &rel));
  OLA_ASSERT_EQ(STATIC_URL_NOT_MATCHED,
                ResolveStaticUrl("/ui", "/json/universe_info", &rel));
  // A different prefix that merely starts with ours must not match.
  OLA_ASSERT_EQ(STATIC_URL_NOT_MATCHED,
                ResolveStaticUrl("/ui", "/uiextra/x.js", &rel));
}

void StaticFilesTest::testResolveRejectsTraversal() {
  string rel;
  OLA_ASSERT_EQ(STATIC_URL_REJECTED,
                ResolveStaticUrl("/ui", "/ui/../etc/passwd", &rel));
  OLA_ASSERT_EQ(STATIC_URL_REJECTED,
                ResolveStaticUrl("/ui", "/ui/assets/../../secret", &rel));
  OLA_ASSERT_EQ(STATIC_URL_REJECTED,
                ResolveStaticUrl("/ui", "/ui/..\\secret", &rel));
  OLA_ASSERT_EQ(STATIC_URL_REJECTED,
                ResolveStaticUrl("/ui", "/ui//etc/passwd", &rel));
  OLA_ASSERT_EQ(STATIC_URL_REJECTED,
                ResolveStaticUrl("/ui", "/ui/C:/Windows/win.ini", &rel));
  OLA_ASSERT_EQ(STATIC_URL_REJECTED,
                ResolveStaticUrl("/ui", "/ui/./app.js", &rel));
  OLA_ASSERT_EQ(STATIC_URL_REJECTED,
                ResolveStaticUrl("/ui", string("/ui/a\0b", 7), &rel));
}

void StaticFilesTest::testContentTypes() {
  OLA_ASSERT_EQ(string("text/html; charset=utf-8"),
                ContentTypeForPath("index.html"));
  OLA_ASSERT_EQ(string("text/javascript; charset=utf-8"),
                ContentTypeForPath("assets/app-1a2b.js"));
  OLA_ASSERT_EQ(string("text/css; charset=utf-8"),
                ContentTypeForPath("assets/app.CSS"));
  OLA_ASSERT_EQ(string("image/svg+xml"), ContentTypeForPath("logo.svg"));
  OLA_ASSERT_EQ(string("font/woff2"), ContentTypeForPath("f.woff2"));
  OLA_ASSERT_EQ(string("application/octet-stream"),
                ContentTypeForPath("data.bin"));
  // A dot in a directory name is not an extension.
  OLA_ASSERT_EQ(string("application/octet-stream"),
                ContentTypeForPath("v1.2/readme"));
}

void StaticFilesTest::testSinglePageRoutes() {
  OLA_ASSERT_TRUE(IsSinglePageRoute("patch"));
  OLA_ASSERT_TRUE(IsSinglePageRoute("settings/plugins"));
  OLA_ASSERT_FALSE(IsSinglePageRoute("assets/app.js"));
  OLA_ASSERT_FALSE(IsSinglePageRoute("favicon.ico"));
  // Missing assets under a dotted directory are still routes without a file.
  OLA_ASSERT_TRUE(IsSinglePageRoute("v1.2/patch"));
}
