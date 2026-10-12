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
 * UiStore.cpp
 * Small named JSON documents kept in olad's config directory.
 */

#include "olad/UiStore.h"

#include <stdio.h>
#include <ola/StringUtils.h>
#include <ola/file/Util.h>
#include <ola/web/Json.h>
#include <ola/web/JsonParser.h>

#include <fstream>
#include <memory>
#include <sstream>
#include <string>

namespace ola {

using std::auto_ptr;
using std::ifstream;
using std::ofstream;
using std::string;

namespace {
const char FILE_PREFIX[] = "ola-ui-";
const char FILE_SUFFIX[] = ".json";
const string::size_type MAX_KEY_LENGTH = 32;
}  // namespace

bool UiStore::IsValidKey(const string &key) {
  if (key.empty() || key.size() > MAX_KEY_LENGTH) {
    return false;
  }
  for (string::const_iterator i = key.begin(); i != key.end(); ++i) {
    const char c = *i;
    const bool ok = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') ||
                    c == '-' || c == '_';
    if (!ok) {
      return false;
    }
  }
  return true;
}

string UiStore::PathFor(const string &key) const {
  return ola::file::JoinPaths(m_directory,
                              string(FILE_PREFIX) + key + FILE_SUFFIX);
}

bool UiStore::Get(const string &key, Document *document) const {
  *document = Document();
  if (!IsValidKey(key)) {
    return false;
  }

  ifstream in(PathFor(key).c_str(), ifstream::binary);
  if (!in.is_open()) {
    return true;  // Never saved.
  }

  // File format: the revision as decimal text, a newline, then the JSON.
  string revision_line;
  if (!std::getline(in, revision_line)) {
    return false;
  }
  unsigned int revision;
  if (!StringToInt(revision_line, &revision)) {
    return false;
  }

  std::ostringstream data;
  data << in.rdbuf();
  if (in.bad()) {
    return false;
  }
  document->revision = revision;
  document->data = data.str();
  return true;
}

UiStore::SaveResult UiStore::Save(const string &key,
                                  unsigned int base_revision,
                                  const string &data,
                                  unsigned int *new_revision) const {
  if (!IsValidKey(key)) {
    return INVALID_KEY;
  }
  if (data.size() > MAX_DOCUMENT_BYTES) {
    return TOO_LARGE;
  }

  string error;
  auto_ptr<ola::web::JsonValue> parsed(
      ola::web::JsonParser::Parse(data, &error));
  if (!parsed.get()) {
    return INVALID_DATA;
  }

  Document current;
  if (!Get(key, &current)) {
    return WRITE_FAILED;  // Don't overwrite something we couldn't read.
  }
  if (current.revision != base_revision) {
    return CONFLICT;
  }

  const unsigned int next = current.revision + 1;
  const string path = PathFor(key);
  const string temp = path + ".tmp";
  {
    ofstream out(temp.c_str(), ofstream::binary | ofstream::trunc);
    if (!out.is_open()) {
      return WRITE_FAILED;
    }
    out << next << "\n" << data;
    out.close();
    if (out.fail()) {
      remove(temp.c_str());
      return WRITE_FAILED;
    }
  }
#ifdef _WIN32
  // rename() won't replace an existing file on Windows.
  remove(path.c_str());
#endif  // _WIN32
  if (rename(temp.c_str(), path.c_str()) != 0) {
    remove(temp.c_str());
    return WRITE_FAILED;
  }

  *new_revision = next;
  return SAVED;
}
}  // namespace ola
