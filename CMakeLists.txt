project(wxbot)

set(CMAKE_CXX_STANDARD 17)

include_directories(src)
add_library(json src/json.cpp src/json.h)

add_executable(wxbot src/main.cpp)
target_link_libraries(wxbot json)

add_library(wxhook SHARED src/hook.cpp)
target_link_libraries(wxhook json)


