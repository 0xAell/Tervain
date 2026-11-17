// Stand-in for FMath, as far as the seed uses it.
#pragma once

#include "CoreMinimal.h"

#include <cmath>

struct FMath
{
	template <typename T> static T Max(T A, T B) { return A > B ? A : B; }
	template <typename T> static T Min(T A, T B) { return A < B ? A : B; }
	/** "Converts a float to the nearest integer. Rounds up when the fraction is .5": Epic's remark on RoundToInt32(float). */
	static int32 RoundToInt32(float F) { return static_cast<int32>(std::floor(F + 0.5f)); }
	static float RadiansToDegrees(float Radians) { return Radians * (180.f / 3.14159265358979323846f); }
	static float DegreesToRadians(float Degrees) { return Degrees * (3.14159265358979323846f / 180.f); }
	/** "static float Sqrt ( float Value )" and "static double Sqrt ( double Value )": the two overloads Epic lists. */
	static float Sqrt(float Value) { return std::sqrt(Value); }
	static double Sqrt(double Value) { return std::sqrt(Value); }
};
