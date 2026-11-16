// Stand-ins for the engine names used by the Unreal seed (unreal/Source/Tervain), so that its C++ can be compiled,
// linked and run by this repository's tests without Unreal Engine. This is not engine code and not part of the seed.
// Each definition follows the behaviour Epic documents for the name it stands in for, as far as the seed uses it.
// docs/unreal/engine-symbols.json records, name by name, the page each was checked against and what could not be
// checked; only a build in the engine itself can confirm the rest.
//
// The stand-ins are stricter than the engine about includes: this header gives only the primitive types and the
// reflection markup. Every other name comes from the header Epic's API reference gives for it, so a source file of
// the seed that forgets one does not compile here.
#pragma once

#include <cstdint>

using uint8 = std::uint8_t;
using int32 = std::int32_t;
using uint32 = std::uint32_t;
// TCHAR is "Either ANSICHAR or WIDECHAR, depending on whether the platform supports wide characters" (Epic's API
// reference), and "All strings in UE are stored in memory in UTF-16 format as FStrings or TCHAR arrays" (Epic's page on
// character encoding). So it is wide here, and a narrow string passed where the engine wants TCHARs does not compile.
using TCHAR = wchar_t;
#define STANDIN_TEXT_PASTE(Literal) L##Literal
#define TEXT(Literal) STANDIN_TEXT_PASTE(Literal)

// Reflection markup: the engine's header tool reads these; a plain compiler sees nothing. Each stand-in
// `*.generated.h` redefines GENERATED_BODY for the classes of its header, as the engine's generated headers do.
#define USTRUCT(...)
#define UCLASS(...)
#define UENUM(...)
#define UPROPERTY(...)
#define UFUNCTION(...)
#define GENERATED_BODY()
#define TERVAIN_API
