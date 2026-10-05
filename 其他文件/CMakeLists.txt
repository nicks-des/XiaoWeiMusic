cmake_minimum_required(VERSION 3.16)

project(MusicPlayerLauncher LANGUAGES CXX)

if(NOT WIN32)
  message(FATAL_ERROR "MusicPlayerLauncher is a Windows launcher and requires Win32 APIs.")
endif()

add_executable(MusicPlayerLauncher native/MusicPlayerLauncher.cpp)
set_target_properties(MusicPlayerLauncher PROPERTIES WIN32_EXECUTABLE TRUE)

target_compile_features(MusicPlayerLauncher PRIVATE cxx_std_17)
target_compile_definitions(MusicPlayerLauncher PRIVATE UNICODE _UNICODE NOMINMAX)
target_link_libraries(MusicPlayerLauncher PRIVATE user32 ws2_32)

if(CMAKE_CXX_COMPILER_ID STREQUAL "GNU")
  target_link_options(MusicPlayerLauncher PRIVATE -mwindows -municode)
  target_link_libraries(MusicPlayerLauncher PRIVATE stdc++fs)
endif()

if(MSVC)
  target_compile_options(MusicPlayerLauncher PRIVATE /W4 /permissive-)
else()
  target_compile_options(MusicPlayerLauncher PRIVATE -Wall -Wextra -Wpedantic)
endif()
