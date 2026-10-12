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
 * StaticFiles.cpp
 * Helpers for serving a directory of static files below a URL prefix.
 */

#include <ola/http/StaticFiles.h>

#include <ctype.h>
#include <string>

namespace ola {
namespace http {

using std::string;

namespace {

bool IsSafeSegment(const string &segment) {
  // Empty segments ("a//b") and dot segments are never produced by a normal
  // client and are a classic way to confuse path handling.
  if (segment.empty() || segment == "." || segment == "..") {
    return false;
  }
  // A drive letter ("C:") would escape the directory on Windows.
  return segment.find(':') == string::npos;
}

bool IsSafeRelativePath(const string &path) {
  if (path.find('\0') != string::npos || path.find('\\') != string::npos) {
    return false;
  }
  string::size_type start = 0;
  while (true) {
    string::size_type end = path.find('/', start);
    if (!IsSafeSegment(path.substr(start, end == string::npos
                                           ? string::npos
                                           : end - start))) {
      return false;
    }
    if (end == string::npos) {
      return true;
    }
    start = end + 1;
  }
}

string LowerExtension(const string &path) {
  string::size_type slash = path.find_last_of('/');
  string::size_type dot = path.find_last_of('.');
  if (dot == string::npos || (slash != string::npos && dot < slash)) {
    return "";
  }
  string ext = path.substr(dot + 1);
  for (string::iterator i = ext.begin(); i != ext.end(); ++i) {
    *i = static_cast<char>(tolower(static_cast<unsigned char>(*i)));
  }
  return ext;
}
}  // namespace

StaticUrlResult ResolveStaticUrl(const string &prefix,
                                 const string &url,
                                 string *relative_path) {
  if (url == prefix) {
    return STATIC_URL_REDIRECT;
  }
  if (url.size() <= prefix.size() ||
      url.compare(0, prefix.size(), prefix) != 0 ||
      url[prefix.size()] != '/') {
    return STATIC_URL_NOT_MATCHED;
  }

  string rest = url.substr(prefix.size() + 1);
  if (rest.empty()) {
    rest = "index.html";
  }
  if (!IsSafeRelativePath(rest)) {
    return STATIC_URL_REJECTED;
  }
  *relative_path = rest;
  return STATIC_URL_OK;
}

string ContentTypeForPath(const string &path) {
  const string ext = LowerExtension(path);
  if (ext == "html" || ext == "htm") return "text/html; charset=utf-8";
  if (ext == "js" || ext == "mjs") return "text/javascript; charset=utf-8";
  if (ext == "css") return "text/css; charset=utf-8";
  if (ext == "json" || ext == "map") return "application/json; charset=utf-8";
  if (ext == "webmanifest") return "application/manifest+json";
  if (ext == "txt") return "text/plain; charset=utf-8";
  if (ext == "svg") return "image/svg+xml";
  if (ext == "png") return "image/png";
  if (ext == "jpg" || ext == "jpeg") return "image/jpeg";
  if (ext == "gif") return "image/gif";
  if (ext == "webp") return "image/webp";
  if (ext == "ico") return "image/x-icon";
  if (ext == "woff2") return "font/woff2";
  if (ext == "woff") return "font/woff";
  if (ext == "wasm") return "application/wasm";
  return "application/octet-stream";
}

bool IsSinglePageRoute(const string &relative_path) {
  return LowerExtension(relative_path).empty();
}
}  // namespace http
}  // namespace ola
