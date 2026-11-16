// Stand-in for TObjectPtr, which Epic's Unreal Engine 5 migration guide calls "an optional replacement for raw object
// pointers", "performing identically to raw pointers in non-editor builds": "TObjectPtr variables also convert
// automatically to raw pointers when passed to functions or stored in local variables". Being held in a UPROPERTY is
// what keeps the object from garbage collection; that happens in the engine's reflection, which a compiler does not see.
#pragma once

#include "CoreMinimal.h"

template <typename T> class TObjectPtr
{
public:
	TObjectPtr(T* InObject = nullptr) : Object(InObject) {}
	operator T*() const { return Object; }
	T* operator->() const { return Object; }
private:
	T* Object;
};
