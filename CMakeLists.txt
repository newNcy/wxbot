project(wxbot)

set(CMAKE_CXX_STANDARD 17)
add_executable(wxbot src/main.cpp)
add_library(wxhook SHARED src/hook.cpp)


