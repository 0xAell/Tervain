// Stand-in for Cast: the object as another class, or null when it is not one.
#pragma once

#include "UObject/Object.h"

template <typename To, typename From> To* Cast(From* Object) { return dynamic_cast<To*>(Object); }
