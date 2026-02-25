cmake_minimum_required(VERSION 3.20)
project(inboil-dsp CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ── Source files ──────────────────────────────────────────────────────────────
set(DSP_SOURCES
    engine/Engine.cpp
)

# ── Emscripten WASM target ────────────────────────────────────────────────────
if (EMSCRIPTEN)
    add_executable(inboil-dsp ${DSP_SOURCES} wasm/bindings.cpp)

    target_include_directories(inboil-dsp PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})

    # AudioWorklet: no Emscripten JS glue needed — we load raw WASM
    set_target_properties(inboil-dsp PROPERTIES
        SUFFIX ".wasm"
    )

    target_link_options(inboil-dsp PRIVATE
        -sWASM=1
        -sSTANDALONE_WASM=1
        -sEXPORTED_FUNCTIONS=["_engine_create","_engine_destroy","_engine_init","_engine_process","_engine_play","_engine_stop","_engine_set_bpm","_engine_set_steps","_engine_set_mute","_engine_set_trig","_engine_set_track_sends","_engine_set_fx","_engine_get_playhead"]
        -sEXPORT_NAME=InboilDSP
        -sINITIAL_MEMORY=16777216  # 16 MB
        -O3
        --no-entry
    )
else()
    # ── Native test build ─────────────────────────────────────────────────────
    add_library(inboil-dsp-native STATIC ${DSP_SOURCES})
    target_include_directories(inboil-dsp-native PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})
endif()
