// Stand-in for FRotator3f's angle helpers.
#pragma once

#include "CoreMinimal.h"

#include <cmath>

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
