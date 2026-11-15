// Stand-in for the module manager: a game module is an object the test can ask for by the module's name.
#pragma once

#include "CoreMinimal.h"

class FDefaultGameModuleImpl
{
public:
	virtual ~FDefaultGameModuleImpl() = default;
};

#define IMPLEMENT_PRIMARY_GAME_MODULE(ModuleImplClass, ModuleName, GameName) \
	ModuleImplClass* StandInModule_##ModuleName() { static ModuleImplClass Module; return &Module; } \
	const char* StandInGameName_##ModuleName() { return GameName; }
