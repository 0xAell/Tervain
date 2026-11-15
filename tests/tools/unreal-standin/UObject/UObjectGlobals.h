// Stand-in for GetDefault: the one default object of a class, which a test may change.
#pragma once

#include "UObject/Object.h"

namespace StandIn
{
	template <typename T> T* MutableDefault() { static T Object; return &Object; }
}

template <typename T> const T* GetDefault() { return StandIn::MutableDefault<T>(); }
