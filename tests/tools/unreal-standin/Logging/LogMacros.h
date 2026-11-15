// Stand-in for the engine's logging macros: a log category is a name, and UE_LOG appends a formatted line to a list
// the tests can read. The format is a TCHAR string, and %s in it takes a TCHAR string, as in the engine.
#pragma once

#include "Containers/UnrealString.h"
#include "CoreMinimal.h"

#include <cwchar>
#include <string>
#include <vector>

struct FStandInLogCategory { const char* Name; };

namespace StandIn
{
	inline std::vector<std::string>& LogLines() { static std::vector<std::string> Lines; return Lines; }
	template <typename... Arguments> void Log(const FStandInLogCategory& Category, const char* Verbosity, const TCHAR* Format, Arguments... Values)
	{
		// The C library's wide %s takes narrow characters; the engine's takes TCHARs, which is %ls here.
		std::wstring Wide(Format);
		for (size_t At = Wide.find(L"%s"); At != std::wstring::npos; At = Wide.find(L"%s", At + 3)) Wide.replace(At, 2, L"%ls");
		wchar_t Buffer[2048];
		std::swprintf(Buffer, sizeof(Buffer) / sizeof(Buffer[0]), Wide.c_str(), Values...);
		LogLines().push_back(std::string(Category.Name) + ": " + Verbosity + ": " + Narrow(Buffer));
	}
}

#define DECLARE_LOG_CATEGORY_EXTERN(CategoryName, DefaultVerbosity, CompileTimeVerbosity) extern FStandInLogCategory CategoryName
#define DEFINE_LOG_CATEGORY(CategoryName) FStandInLogCategory CategoryName{ #CategoryName }
#define UE_LOG(CategoryName, Verbosity, Format, ...) StandIn::Log(CategoryName, #Verbosity, Format, ##__VA_ARGS__)
