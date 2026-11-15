// Stand-in for the load flags of UObject/ObjectMacros.h, as Epic's API reference gives them (ELoadFlags).
#pragma once

#include "CoreMinimal.h"

enum ELoadFlags
{
	LOAD_None = 0x00000000,
	LOAD_Async = 0x00000001,
	LOAD_NoWarn = 0x00000002,
	LOAD_Quiet = 0x00002000,
};
