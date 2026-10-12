# LIBRARIES
##################################################
if HAVE_LIBMICROHTTPD
noinst_LTLIBRARIES += common/http/libolahttp.la
common_http_libolahttp_la_SOURCES = \
    common/http/HTTPServer.cpp \
    common/http/OlaHTTPServer.cpp \
    common/http/StaticFiles.cpp
common_http_libolahttp_la_LIBADD = $(libmicrohttpd_LIBS)
endif

# TESTS
##################################################
if HAVE_LIBMICROHTTPD
test_programs += common/http/StaticFilesTester

common_http_StaticFilesTester_SOURCES = common/http/StaticFilesTest.cpp
common_http_StaticFilesTester_CXXFLAGS = $(COMMON_TESTING_FLAGS)
common_http_StaticFilesTester_LDADD = $(COMMON_TESTING_LIBS) \
                                      common/http/libolahttp.la
endif
