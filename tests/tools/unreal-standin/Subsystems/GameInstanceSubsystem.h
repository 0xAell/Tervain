// Stand-in for the subsystem base classes: a subsystem is initialised once with its collection.
#pragma once

#include "UObject/StandInObject.h"

class FSubsystemCollectionBase {};

class USubsystem : public UObject
{
public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) { (void)Collection; }
};

class UGameInstanceSubsystem : public USubsystem {};
