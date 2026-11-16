// Stand-in for FVector.
#pragma once

#include "CoreMinimal.h"

/**
 * Double-precision vector, as FVector is since Unreal Engine 5. As in the engine, the default constructor leaves the
 * components unset ("Default constructor (no initialization)"): a vector that is read must have been given a value.
 */
struct FVector
{
	double X, Y, Z;
	FVector() {}
	FVector(double InX, double InY, double InZ) : X(InX), Y(InY), Z(InZ) {}
	static const FVector ZeroVector;
};
inline const FVector FVector::ZeroVector{ 0.0, 0.0, 0.0 };
