// Stand-in for FFileHelper: read a whole text file.
#pragma once

#include "CoreMinimal.h"

#include <fstream>
#include <sstream>

class FFileHelper
{
public:
	static bool LoadFileToString(FString& Result, const TCHAR* Filename)
	{
		std::ifstream File(Filename, std::ios::binary);
		if (!File) return false;
		std::ostringstream Text;
		Text << File.rdbuf();
		Result = FString(Text.str());
		return true;
	}
};
