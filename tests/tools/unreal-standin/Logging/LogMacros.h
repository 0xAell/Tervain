// Stand-in for the engine's logging macros: a log category is a name, and UE_LOG appends a formatted line to a list
// the tests can read.
#pragma once

#include "CoreMinimal.h"

struct FStandInLogCategory { const char* Name; };

namespace StandIn
{
	inline std::vector<std::string>& LogLines() { static std::vector<std::string> Lines; return Lines; }
	template <typename... Arguments> void Log(const FStandInLogCategory& Category, const char* Verbosity, const char* Format, Arguments... Values)
	{
		char Buffer[2048];
		std::snprintf(Buffer, sizeof(Buffer), Format, Values...);
		LogLines().push_back(std::string(Category.Name) + ": " + Verbosity + ": " + Buffer);
	}
}

#define DECLARE_LOG_CATEGORY_EXTERN(CategoryName, DefaultVerbosity, CompileTimeVerbosity) extern FStandInLogCategory CategoryName
#define DEFINE_LOG_CATEGORY(CategoryName) FStandInLogCategory CategoryName{ #CategoryName }
#define UE_LOG(CategoryName, Verbosity, Format, ...) StandIn::Log(CategoryName, #Verbosity, Format, ##__VA_ARGS__)
