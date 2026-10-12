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
 * StaticFiles.h
 * Helpers for serving a directory of static files (e.g. a single page web UI)
 * below a URL prefix. Pure functions, no I/O, so they can be unit tested.
 */

/**
 * @addtogroup http
 * @{
 * @file StaticFiles.h
 * @brief Map URLs onto files in a served directory, safely.
 * @}
 */

#ifndef INCLUDE_OLA_HTTP_STATICFILES_H_
#define INCLUDE_OLA_HTTP_STATICFILES_H_

#include <string>

namespace ola {
namespace http {

/**
 * @brief The outcome of matching a request URL against a served directory.
 */
enum StaticUrlResult {
  STATIC_URL_NOT_MATCHED,  /**< The URL isn't under the prefix. */
  STATIC_URL_REDIRECT,     /**< The URL is the bare prefix; redirect to prefix/ */
  STATIC_URL_REJECTED,     /**< The URL is under the prefix but unsafe. */
  STATIC_URL_OK            /**< `relative_path` holds a safe relative path. */
};

/**
 * @brief Match a URL against a prefix and extract the file path below it.
 * @param prefix the URL prefix, with a leading slash and no trailing slash,
 *   e.g. "/ui".
 * @param url the request URL (already percent-decoded).
 * @param[out] relative_path set when STATIC_URL_OK is returned. The prefix
 *   root ("/ui/") maps to "index.html".
 *
 * Anything that could escape the served directory is rejected: ".." segments,
 * backslashes, drive letters, NUL bytes and empty segments.
 */
StaticUrlResult ResolveStaticUrl(const std::string &prefix,
                                 const std::string &url,
                                 std::string *relative_path);

/**
 * @brief The Content-Type for a file, chosen by extension.
 */
std::string ContentTypeForPath(const std::string &path);

/**
 * @brief True if a missing file at this path should fall back to index.html.
 *
 * Client-side routes ("/ui/settings") have no file extension; a missing asset
 * ("/ui/app.js") must still 404 rather than return HTML.
 */
bool IsSinglePageRoute(const std::string &relative_path);
}  // namespace http
}  // namespace ola
#endif  // INCLUDE_OLA_HTTP_STATICFILES_H_
