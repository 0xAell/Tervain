// Stand-in for FFileHelper: read a whole text file. The signature is the one Epic's API reference gives, with no
// default arguments, since the reference prints none: a call must pass every parameter.
#pragma once

#include "Containers/UnrealString.h"
#include "CoreMinimal.h"

#include <fstream>
#include <sstream>

class FFileHelper
{
public:
	enum EHashOptions
	{
		None = 0,
		EnableVerify = 1 << 0,
		ErrorMissingHash = 1 << 1,
	};

	/** Read a UTF-8 text file into an FString. False when the file cannot be read. Hash checks and read flags are accepted and ignored. */
	static bool LoadFileToString(FString& Result, const TCHAR* Filename, EHashOptions VerifyFlags, uint32 ReadFlags)
	{
		(void)VerifyFlags; (void)ReadFlags;
		std::ifstream File(StandIn::Narrow(Filename), std::ios::binary);
		if (!File) return false;
		std::ostringstream Text;
		Text << File.rdbuf();
		Result = FString(StandIn::Widen(Text.str()));
		return true;
	}
};
