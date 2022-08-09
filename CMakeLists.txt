project(wxbot)

set(CMAKE_CXX_STANDARD 17)

add_library(bencode src/bencode.cpp)

add_executable(wxbot src/main.cpp)
target_link_libraries(wxbot ws2_32 bencode)

add_library(wxhook SHARED src/hook.cpp)
target_link_libraries(wxhook ws2_32 bencode)


