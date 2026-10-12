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
 * UiStore.h
 * Small named JSON documents kept in olad's config directory, for the web UI's
 * fixtures, scenes and so on, so that every phone, tablet and PC sees the same.
 */

#ifndef OLAD_UISTORE_H_
#define OLAD_UISTORE_H_

#include <string>

namespace ola {

/**
 * @brief Named JSON documents with optimistic concurrency.
 *
 * Each key holds one document and a revision number that starts at 0 (never
 * saved) and goes up by one on every save. A save names the revision the
 * caller last saw and is refused if the document has moved on, so a stale
 * browser tab can't silently overwrite another device's work.
 *
 * Documents are files named ola-ui-<key>.json in the given directory, written
 * to a temporary file first so a crash can't leave half a document behind.
 * The object holds no state: construct one per request.
 */
class UiStore {
 public:
  struct Document {
    unsigned int revision;  /**< 0 if the key was never saved. */
    std::string data;       /**< The JSON text, empty if never saved. */

    Document() : revision(0) {}
  };

  enum SaveResult {
    SAVED,
    CONFLICT,      /**< base_revision isn't the current revision. */
    INVALID_KEY,
    INVALID_DATA,  /**< Not valid JSON. */
    TOO_LARGE,
    WRITE_FAILED
  };

  /** @brief The largest document we accept. */
  static const unsigned int MAX_DOCUMENT_BYTES = 1024 * 1024;

  explicit UiStore(const std::string &directory) : m_directory(directory) {}

  /**
   * @brief Keys are 1-32 characters of a-z, 0-9, '-' and '_', so a key can never
   * name a path.
   */
  static bool IsValidKey(const std::string &key);

  /**
   * @brief Read a document.
   * @returns false if the key is invalid or the file exists but is unreadable.
   *   A key that was never saved is not an error: revision 0, empty data.
   */
  bool Get(const std::string &key, Document *document) const;

  /**
   * @brief Replace a document.
   * @param base_revision the revision the caller last saw.
   * @param[out] new_revision set when SAVED is returned.
   */
  SaveResult Save(const std::string &key,
                  unsigned int base_revision,
                  const std::string &data,
                  unsigned int *new_revision) const;

 private:
  std::string m_directory;

  std::string PathFor(const std::string &key) const;
};
}  // namespace ola
#endif  // OLAD_UISTORE_H_
