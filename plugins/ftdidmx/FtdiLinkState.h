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
 * FtdiLinkState.h
 * Tracks whether an FTDI widget is still answering, so the output thread can log
 * a loss once, retry opening the widget at a calm pace, and say when it is back.
 */

#ifndef PLUGINS_FTDIDMX_FTDILINKSTATE_H_
#define PLUGINS_FTDIDMX_FTDILINKSTATE_H_

#include <stdint.h>

namespace ola {
namespace plugin {
namespace ftdidmx {

class FtdiLinkState {
 public:
  enum Event {
    NONE,       /**< Nothing changed. */
    LOST,       /**< First failed frame after working ones: report it once. */
    RECOVERED   /**< The first good frame after failed ones. */
  };

  /** @param retry_ms how long to wait between attempts to reopen the widget. */
  explicit FtdiLinkState(int64_t retry_ms = 1000)
      : m_retry_ms(retry_ms), m_failing(false), m_last_attempt_ms(0) {}

  /** @brief Report the outcome of one frame. */
  Event FrameResult(bool ok, int64_t now_ms) {
    if (ok) {
      if (!m_failing) {
        return NONE;
      }
      m_failing = false;
      return RECOVERED;
    }
    if (m_failing) {
      return NONE;
    }
    m_failing = true;
    m_last_attempt_ms = now_ms;
    return LOST;
  }

  /**
   * @brief True when the widget is down and it is time to try reopening it.
   * Calling it counts as an attempt: the next call waits another retry interval.
   */
  bool ShouldReconnect(int64_t now_ms) {
    if (!m_failing || now_ms - m_last_attempt_ms < m_retry_ms) {
      return false;
    }
    m_last_attempt_ms = now_ms;
    return true;
  }

  bool Failing() const { return m_failing; }

 private:
  int64_t m_retry_ms;
  bool m_failing;
  int64_t m_last_attempt_ms;
};
}  // namespace ftdidmx
}  // namespace plugin
}  // namespace ola
#endif  // PLUGINS_FTDIDMX_FTDILINKSTATE_H_
