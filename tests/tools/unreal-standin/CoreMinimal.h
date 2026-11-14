// Stand-ins for the few engine names used by the seed's plain rule and unit code (unreal/Source/Tervain), so that
// code can be compiled and run by this repository's tests without Unreal Engine. This is not engine code. Each
// definition follows the behaviour Epic documents for the name it stands in for, and nothing here is part of the seed.
#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>

using uint8 = std::uint8_t;
using int32 = std::int32_t;

// Reflection markup: the engine's header tool reads these; a plain compiler sees nothing.
#define USTRUCT(...)
#define UENUM(...)
#define UPROPERTY(...)
#define GENERATED_BODY()
#define TERVAIN_API

struct FMath
{
	template <typename T> static T Max(T A, T B) { return A > B ? A : B; }
	template <typename T> static T Min(T A, T B) { return A < B ? A : B; }
	/** "Converts a float to the nearest integer. Rounds up when the fraction is .5". */
	static int32 RoundToInt(float F) { return static_cast<int32>(std::floor(F + 0.5f)); }
	static float RadiansToDegrees(float Radians) { return Radians * (180.f / 3.14159265358979323846f); }
	static float DegreesToRadians(float Degrees) { return Degrees * (3.14159265358979323846f / 180.f); }
};

/** Double-precision vector, as FVector is since Unreal Engine 5. */
struct FVector
{
	double X = 0, Y = 0, Z = 0;
	FVector() = default;
	FVector(double InX, double InY, double InZ) : X(InX), Y(InY), Z(InZ) {}
};

struct FRotator3f
{
	/** An angle in the range [0, 360). */
	static float ClampAxis(float Angle)
	{
		Angle = std::fmod(Angle, 360.f);
		return Angle < 0.f ? Angle + 360.f : Angle;
	}
	/** An angle in the range (-180, 180]. */
	static float NormalizeAxis(float Angle)
	{
		Angle = ClampAxis(Angle);
		return Angle > 180.f ? Angle - 360.f : Angle;
	}
};
